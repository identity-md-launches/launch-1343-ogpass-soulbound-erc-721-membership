import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import App from "../src/App";
import { founders, founderTree } from "../src/founders";
import type { Member, Snapshot } from "../src/model";
import deployment from "../public/imd-deployment.json";

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  member: vi.fn(),
  invite: vi.fn(),
  wallet: vi.fn(),
  provider: { request: vi.fn() },
}));
vi.mock("../src/chain", () => ({
  loadConfiguration: async () => ({
    deployment: {},
    config: { telegramEndpoint: "/api/tg-invite", ogEthPool: null },
  }),
  Club: class {
    address = deployment.contracts[0].address;
    og = deployment.manifest.contracts[0].constructorArgs[0];
    verified = true;
    verify = async () => {};
    snapshot = mocks.snapshot;
    member = mocks.member;
    history = async () => ({
      events: [],
      burned: 0n,
      throughBlock: 26171780n,
    });
    prices = async () => [1000000n * 10n ** 18n, 1010000n * 10n ** 18n];
    ethSpot = async () => 0.000001;
  },
}));
vi.mock("../src/wallet", async (original) => ({
  ...(await original<typeof import("../src/wallet")>()),
  useWallet: mocks.wallet,
}));
vi.mock("../src/telegram", async (original) => ({
  ...(await original<typeof import("../src/telegram")>()),
  requestTelegramInvite: mocks.invite,
}));

const account = getAddress(founders[0]);
const other = getAddress(founders[1]);
const inviteUrl = "https://t.me/+regressionTest";
const inviteName = /Open your single-use Telegram invite/;
let identity: typeof account | undefined;
let version: number;
let member: Omit<Member, "address">;
let snapshot: Snapshot;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  vi.clearAllMocks();
  // jsdom does not implement native dialog opening; browser checks cover focus.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  identity = account;
  version = 1;
  member = {
    member: true,
    founder: false,
    tokenId: 7n,
    claimed: false,
    balance: 2000000n * 10n ** 18n,
  };
  snapshot = {
    block: 26171780n,
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    loadedAt: Date.now(),
    currentBuyPrice: 1010000n * 10n ** 18n,
    currentSellPrice: 925000n * 10n ** 18n,
    publicSupply: 1n,
    founderClaimed: 0n,
    founderOutstanding: 0n,
    reservedFounderSlots: 49n,
    curveReserve: 1000000n * 10n ** 18n,
    founderReserve: 4900000n * 10n ** 18n,
    MAX_SUPPLY: 1000n,
    FOUNDER_BUYBACK: 100000n * 10n ** 18n,
    founderCount: 49n,
    founderRoot: founderTree.root as `0x${string}`,
    claimDeadline: BigInt(Math.floor(Date.now() / 1000)) + 86400n,
    buysPaused: false,
  };
  mocks.snapshot.mockImplementation(async () => ({
    ...snapshot,
    loadedAt: Date.now(),
  }));
  mocks.member.mockImplementation(async (address) => ({
    ...member,
    address,
  }));
  mocks.invite.mockResolvedValue(inviteUrl);
  mocks.provider.request.mockImplementation(async ({ method }) => {
    if (method === "eth_accounts") return identity ? [identity] : [];
    if (method === "eth_chainId") return "0x1";
    throw new Error(`Unexpected wallet request: ${method}`);
  });
  mocks.wallet.mockImplementation(() => ({
    address: identity,
    chainId: identity ? 1 : undefined,
    selected: identity ? { provider: mocks.provider } : undefined,
    wallets: [],
    sessionVersion: () => version,
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function refresh() {
  const reads = mocks.member.mock.calls.length;
  fireEvent.click(
    await screen.findByRole("button", { name: "Refresh data" }),
  );
  await waitFor(() =>
    expect(mocks.member.mock.calls.length).toBeGreaterThan(reads),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Refresh data" }),
    ).toBeEnabled(),
  );
}
async function requestInvite() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Join the members’ Telegram" }),
  );
  await screen.findByText("Your single-use Telegram invite is ready.");
  await waitFor(() =>
    expect(mocks.snapshot.mock.calls.length).toBeGreaterThan(1),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Refresh data" }),
    ).toBeEnabled(),
  );
  await screen.findByRole("heading", { name: "Alpha" });
  expect(screen.getByRole("link", { name: inviteName })).toHaveAttribute(
    "href",
    inviteUrl,
  );
}

describe("member invite lifecycle", () => {
  it("retains the usable invite after success, manual refresh and the 30-second refresh", async () => {
    render(<App />);
    await requestInvite();
    expect(screen.getByRole("link", { name: inviteName })).toHaveAttribute(
      "href",
      inviteUrl,
    );
    await refresh();
    expect(screen.getByRole("link", { name: inviteName })).toHaveAttribute(
      "href",
      inviteUrl,
    );
    const reads = mocks.snapshot.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    await waitFor(() =>
      expect(mocks.snapshot.mock.calls.length).toBeGreaterThan(reads),
    );
    expect(
      await screen.findByRole("link", { name: inviteName }),
    ).toHaveAttribute("href", inviteUrl);
  });

  it.each(["another member", "disconnect"])(
    "clears the invite on %s and does not restore it on return",
    async (change) => {
      const view = render(<App />);
      await requestInvite();
      identity = change === "disconnect" ? undefined : other;
      version++;
      view.rerender(<App />);
      if (identity)
        await screen.findByRole("button", {
          name: "Join the members’ Telegram",
        });
      else
        await screen.findByRole("heading", {
          name: "A pass opens the door.",
        });
      expect(
        screen.queryByRole("link", { name: inviteName }),
      ).not.toBeInTheDocument();
      identity = account;
      version++;
      view.rerender(<App />);
      await screen.findByRole("button", {
        name: "Join the members’ Telegram",
      });
      expect(
        screen.queryByRole("link", { name: inviteName }),
      ).not.toBeInTheDocument();
    },
  );

  it("clears the invite on confirmed membership loss, including after reacquiring a pass", async () => {
    render(<App />);
    await requestInvite();
    member.member = false;
    await refresh();
    await screen.findByRole("heading", { name: "A pass opens the door." });
    member.member = true;
    await refresh();
    await screen.findByRole("button", { name: "Join the members’ Telegram" });
    expect(
      screen.queryByRole("link", { name: inviteName }),
    ).not.toBeInTheDocument();
  });

  it("discards an invite response that arrives after the wallet identity changes", async () => {
    let finish!: (url: string) => void;
    mocks.invite.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<App />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Join the members’ Telegram",
      }),
    );
    await waitFor(() => expect(mocks.invite).toHaveBeenCalledOnce());
    identity = other;
    version++;
    view.rerender(<App />);
    await act(async () => {
      finish(inviteUrl);
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Join the members’ Telegram" }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByRole("link", { name: inviteName }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Your single-use Telegram invite is ready."),
    ).not.toBeInTheDocument();
  });
});

describe("sell card quotes", () => {
  it.each([false, true])(
    "quotes the fixed founder payout and ETH estimate (unfunded: %s)",
    async (unfunded) => {
      member.founder = true;
      member.claimed = true;
      if (unfunded) snapshot.founderReserve = 0n;
      render(<App />);
      await screen.findByRole("heading", { name: "Alpha" });
      fireEvent.click(screen.getByRole("button", { name: "Sell a pass" }));
      const card = within(
        screen.getByRole("region", { name: "The OG Pass" }),
      );
      expect(card.getByText("Fixed founder buyback")).toBeVisible();
      expect(
        card.getByText("100,000", { exact: false, selector: ".quote-value" }),
      ).toBeVisible();
      expect(card.getByText("≈ 0.1 ETH · spot estimate")).toBeVisible();
      expect(
        card.getByText("You lose membership and can never claim again."),
      ).toBeVisible();
      expect(
        card.queryByText("Public sale:", { exact: false }),
      ).not.toBeInTheDocument();
      if (unfunded)
        expect(
          card.getByRole("button", {
            name: "Buyback reserve not funded yet",
          }),
        ).toBeDisabled();
      else {
        fireEvent.click(
          card.getByRole("button", { name: "Review founder buyback" }),
        );
        const dialog = within(screen.getByRole("dialog"));
        expect(dialog.getByText("100,000 OG", { exact: true })).toBeVisible();
        fireEvent.click(dialog.getByRole("button", { name: "Close dialog" }));
      }
      expect(
        within(
          screen.getByRole("region", { name: "The curve, in the open." }),
        ).getByText("925,000 OG"),
      ).toBeVisible();
      fireEvent.click(card.getByRole("button", { name: "Buy a pass" }));
      expect(card.getByText("Current buy price")).toBeVisible();
      expect(
        card.getByText("1,010,000", {
          exact: false,
          selector: ".quote-value",
        }),
      ).toBeVisible();
    },
  );

  it("keeps the public net payout and burn caption for public holders", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Alpha" });
    fireEvent.click(screen.getByRole("button", { name: "Sell a pass" }));
    const card = within(screen.getByRole("region", { name: "The OG Pass" }));
    expect(card.getByText("Current public sell payout")).toBeVisible();
    expect(
      card.getByText("925,000", { exact: false, selector: ".quote-value" }),
    ).toBeVisible();
    expect(
      card.getByText("Public sale:", { exact: false }),
    ).toHaveTextContent("92.5%; 7.5% is burned");
    expect(card.getByRole("button", { name: "Review sale" })).toBeEnabled();
  });
});
