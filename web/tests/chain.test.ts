import { describe, it, expect, vi } from "vitest";
import {
  scanRanges,
  survivingToken,
  summarizeHistory,
  Club,
} from "../src/chain";
import { capacity, errorText } from "../src/model";
import { founderTree, founders, founderProof } from "../src/founders";
import deployment from "../public/imd-deployment.json";
import type { ClubEvent, Deployment } from "../src/model";
import type { Address } from "viem";
describe("chain-derived facts", () => {
  it("matches all 49 supplied founders to the pinned root with valid proofs", () => {
    expect(founders).toHaveLength(49);
    expect(new Set(founders.map((a) => a.toLowerCase())).size).toBe(49);
    expect(founderTree.root).toBe(
      deployment.manifest.contracts[0].constructorArgs[1],
    );
    for (const a of founders)
      expect(founderTree.verify([a.toLowerCase()], founderProof(a)!)).toBe(
        true,
      );
  });
  it("ignores burned older passes when a wallet reacquires membership", () => {
    expect(
      survivingToken(
        [
          { args: { tokenId: 1n } },
          { args: { tokenId: 20n } },
          { args: { tokenId: 21n } },
        ],
        [{ args: { tokenId: 1n } }, { args: { tokenId: 20n } }],
      ),
    ).toBe(21n);
  });
  it("does not invent a token ID if every mint was burned", () => {
    expect(
      survivingToken([{ args: { tokenId: 1n } }], [{ args: { tokenId: 1n } }]),
    ).toBeUndefined();
  });
  it("scans the entire window from the exact deployment block in bounded chunks", async () => {
    const calls: bigint[][] = [];
    const values = await scanRanges(26171777n, 26183000n, async (a, b) => {
      calls.push([a, b]);
      return [a, b];
    });
    expect(calls).toEqual([
      [26171777n, 26176776n],
      [26176777n, 26181776n],
      [26181777n, 26183000n],
    ]);
    expect(values.at(-1)).toBe(26183000n);
  });
  it("shrinks rejected ranges and never skips or double-counts a block", async () => {
    const calls: bigint[][] = [];
    const values = await scanRanges(26171777n, 26181777n, async (a, b) => {
      if (b - a > 700n) throw new Error("range too large");
      calls.push([a, b]);
      return [a];
    });
    expect(calls[0][0]).toBe(26171777n);
    expect(calls.at(-1)![1]).toBe(26181777n);
    calls.slice(1).forEach((c, i) => expect(c[0]).toBe(calls[i][1] + 1n));
    expect(values.length).toBe(calls.length);
  });
  it("throws instead of returning a partial-window total", async () => {
    await expect(
      scanRanges(0n, 6000n, async (a) => {
        if (a >= 5000n) throw new Error("RPC offline");
        return [1];
      }),
    ).rejects.toThrow("RPC offline");
  });
  it("uses all three supply counters to determine sold out", () => {
    expect(
      capacity({
        publicSupply: 951n,
        founderOutstanding: 0n,
        reservedFounderSlots: 49n,
        MAX_SUPPLY: 1000n,
      }).soldOut,
    ).toBe(true);
    expect(
      capacity({
        publicSupply: 951n,
        founderOutstanding: 0n,
        reservedFounderSlots: 0n,
        MAX_SUPPLY: 1000n,
      }).available,
    ).toBe(49n);
    expect(
      capacity({
        publicSupply: 1001n,
        founderOutstanding: 0n,
        reservedFounderSlots: 0n,
        MAX_SUPPLY: 1000n,
      }).available,
    ).toBe(0n);
  });
  it("sums Sell.burned plus ReserveBurned.amount and returns only the latest 20 Buy/Sell", () => {
    const logs = Array.from({ length: 24 }, (_, i) => ({
      eventName: i % 2 ? "Sell" : "Buy",
      args: { burned: 7n, payout: 93n, price: 100n },
      blockNumber: BigInt(i),
      logIndex: 0,
      transactionHash: "0x12",
    })) as ClubEvent[];
    logs.push({
      eventName: "ReserveBurned",
      args: { amount: 100n },
      blockNumber: 24n,
      logIndex: 0,
      transactionHash: "0x12",
    });
    const h = summarizeHistory(logs, 24n);
    expect(h.burned).toBe(184n);
    expect(h.events).toHaveLength(20);
    expect(h.events[0].blockNumber).toBe(23n);
  });
  it("checks isMember before searching mint/burn logs, then checks founder and actual owner", async () => {
    const account = founders[0] as Address;
    const readContract = vi.fn(
      async ({ functionName }: { functionName: string }) =>
        ({
          isMember: true,
          hasClaimedFounder: false,
          balanceOf: 20n,
          isFounder: true,
          ownerOf: account,
        })[functionName as "isMember"],
    );
    const getLogs = vi.fn(
      async ({ args }: { args: { from: Address; to: Address } }) =>
        args.to.toLowerCase() === account.toLowerCase()
          ? [{ args: { tokenId: 9n } }]
          : [],
    );
    const c = new Club(
      deployment as unknown as Deployment,
      { readContract, getLogs } as never,
    );
    const m = await c.member(
      account,
      BigInt(deployment.contracts[0].blockNumber + 2),
    );
    expect(m.tokenId).toBe(9n);
    expect(m.founder).toBe(true);
    expect(
      getLogs.mock.calls.every(
        ([a]) =>
          (a as unknown as { fromBlock: bigint }).fromBlock === 26171777n,
      ),
    ).toBe(true);
  });
  it("does not scan transfer logs for a non-member", async () => {
    const getLogs = vi.fn();
    const c = new Club(
      deployment as unknown as Deployment,
      {
        readContract: vi.fn(
          async ({ functionName }: { functionName: string }) =>
            functionName === "balanceOf" ? 0n : false,
        ),
        getLogs,
      } as never,
    );
    const m = await c.member(founders[0], 26171778n);
    expect(m.member).toBe(false);
    expect(getLogs).not.toHaveBeenCalled();
  });
  it("has useful rejection and price-movement recovery messages", () => {
    expect(errorText({ code: 4001 })).toContain("declined");
    expect(errorText(new Error("PriceAboveMax"))).toContain(
      "Refresh the quote",
    );
  });
});
