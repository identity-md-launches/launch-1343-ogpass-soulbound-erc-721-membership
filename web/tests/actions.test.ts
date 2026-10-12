import { describe, it, expect, vi } from "vitest";
import type { Address, Hex } from "viem";
import {
  buyPass,
  sellPass,
  claimPass,
  sellFounderPass,
  PriceMoved,
  type ActionPort,
} from "../src/actions";
import { founderTree, founders } from "../src/founders";
const quote = 1010000n * 10n ** 18n,
  hash = `0x${"12".repeat(32)}` as Hex;
function port(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    currentBuyPrice: quote,
    currentSellPrice: 925000n * 10n ** 18n,
    founderRoot: founderTree.root,
    hasClaimedFounder: false,
    isMember: false,
    claimDeadline: 2000n,
    founderReserve: 100000n * 10n ** 18n,
    FOUNDER_BUYBACK: 100000n * 10n ** 18n,
    ...overrides,
  };
  return {
    account: founders[0] as Address,
    guard: vi.fn(async () => {}),
    read: vi.fn(async (name: string) => values[name]),
    allowance: vi.fn(async () => quote),
    approve: vi.fn(async () => hash),
    write: vi.fn(async () => hash),
    wait: vi.fn(async () => {}),
    status: vi.fn(),
    now: () => 1000000,
  } as unknown as ActionPort & {
    guard: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    approve: ReturnType<typeof vi.fn>;
    wait: ReturnType<typeof vi.fn>;
    allowance: ReturnType<typeof vi.fn>;
  };
}
describe("transaction boundaries", () => {
  it("approves exactly the quote, waits, then buys with a ten-minute deadline", async () => {
    const p = port();
    await buyPass(p, quote);
    expect(p.approve).toHaveBeenCalledExactlyOnceWith(quote);
    expect(p.write).toHaveBeenCalledExactlyOnceWith("buy", [quote, 1600n]);
    expect(p.wait).toHaveBeenCalledTimes(2);
    expect(p.guard).toHaveBeenCalledTimes(3);
  });
  it("requotes before approval when the price changes", async () => {
    const p = port({ currentBuyPrice: quote + 1n });
    await expect(buyPass(p, quote)).rejects.toBeInstanceOf(PriceMoved);
    expect(p.approve).not.toHaveBeenCalled();
    expect(p.write).not.toHaveBeenCalled();
  });
  it("does not purchase when price moves after the approval; a second review approves the new exact quote", async () => {
    const p = port();
    p.read.mockResolvedValueOnce(quote).mockResolvedValueOnce(quote + 1n);
    await expect(buyPass(p, quote)).rejects.toBeInstanceOf(PriceMoved);
    expect(p.write).not.toHaveBeenCalled();
    p.read.mockResolvedValue(quote + 1n);
    p.allowance.mockResolvedValue(quote + 1n);
    await buyPass(p, quote + 1n);
    expect(p.approve.mock.calls.map((c) => c[0])).toEqual([quote, quote + 1n]);
    expect(p.write).toHaveBeenCalledWith("buy", [quote + 1n, 1600n]);
  });
  it("stops when the wallet changes after approval", async () => {
    const p = port();
    p.guard
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("account changed"));
    await expect(buyPass(p, quote)).rejects.toThrow("account changed");
    expect(p.write).not.toHaveBeenCalled();
  });
  it("never buys after a rejected approval", async () => {
    const p = port();
    p.approve.mockRejectedValue({ code: 4001 });
    await expect(buyPass(p, quote)).rejects.toEqual({ code: 4001 });
    expect(p.write).not.toHaveBeenCalled();
  });
  it("never buys after a reverted approval", async () => {
    const p = port();
    p.wait.mockRejectedValue(new Error("reverted"));
    await expect(buyPass(p, quote)).rejects.toThrow("reverted");
    expect(p.write).not.toHaveBeenCalled();
  });
  it("refuses an unlimited or otherwise unexpected allowance", async () => {
    const p = port();
    p.allowance.mockResolvedValue((1n << 256n) - 1n);
    await expect(buyPass(p, quote)).rejects.toThrow("allowance differs");
    expect(p.write).not.toHaveBeenCalled();
  });
  it("uses currentSellPrice as the net minOut without deducting another 7.5%", async () => {
    const p = port();
    await sellPass(p, 37n, 925000n * 10n ** 18n);
    expect(p.write).toHaveBeenCalledWith("sell", [
      37n,
      925000n * 10n ** 18n,
      1600n,
    ]);
    expect(p.approve).not.toHaveBeenCalled();
  });
  it("requires another review after the sale quote changes", async () => {
    const p = port({ currentSellPrice: 900n });
    await expect(sellPass(p, 37n, 925n)).rejects.toBeInstanceOf(PriceMoved);
    expect(p.write).not.toHaveBeenCalled();
  });
  it("claims using the OpenZeppelin proof for the connected founder", async () => {
    const p = port();
    await claimPass(p);
    const [name, [proof]] = p.write.mock.calls[0];
    expect(name).toBe("claimFounder");
    expect(founderTree.verify([p.account.toLowerCase()], proof)).toBe(true);
  });
  it.each([
    { founderRoot: `0x${"ab".repeat(32)}` },
    { hasClaimedFounder: true },
    { isMember: true },
    { claimDeadline: 1000n },
  ])("prevents claim for invalid founder state", async (override) => {
    const p = port(override);
    await expect(claimPass(p)).rejects.toThrow();
    expect(p.write).not.toHaveBeenCalled();
  });
  it("blocks an unfunded founder sale", async () => {
    const p = port({ founderReserve: 99999n * 10n ** 18n });
    await expect(sellFounderPass(p, 19n)).rejects.toThrow("not funded");
    expect(p.write).not.toHaveBeenCalled();
  });
  it("sells a funded founder pass by token ID with no public-sale arguments", async () => {
    const p = port();
    await sellFounderPass(p, 19n);
    expect(p.write).toHaveBeenCalledWith("sellFounder", [19n]);
  });
});
