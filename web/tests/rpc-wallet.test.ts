import { afterEach, describe, it, expect, vi } from "vitest";
import { Club, makeClient } from "../src/chain";
import type { Deployment } from "../src/model";
import deployment from "../public/imd-deployment.json";
import { actionPort, assertWallet, type InjectedProvider } from "../src/wallet";
import { founders } from "../src/founders";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("RPC fallback and injected-wallet guard", () => {
  it("backs off on HTTP 429 then falls through to another public provider", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        calls.push(request.url);
        if (request.url.includes("first.test"))
          return new Response("rate limited", { status: 429 });
        const body = await request.json();
        const answer = (q: { id: number }) => ({
          jsonrpc: "2.0",
          id: q.id,
          result: "0x1",
        });
        return new Response(
          JSON.stringify(Array.isArray(body) ? body.map(answer) : answer(body)),
          { headers: { "content-type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetcher);
    const c = makeClient(["https://first.test", "https://second.test"]);
    const promise = c.getChainId();
    await vi.advanceTimersByTimeAsync(20);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(calls.filter((x) => x.includes("first"))).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2200);
    expect(await promise).toBe(1);
    expect(calls.filter((x) => x.includes("first"))).toHaveLength(3);
    expect(calls.at(-1)).toContain("second.test");
  });
  it("accepts the connected address only on mainnet", async () => {
    const p = {
      request: vi.fn(async ({ method }: { method: string }) =>
        method === "eth_chainId" ? "0x1" : [founders[0]],
      ),
    } as unknown as InjectedProvider;
    await expect(assertWallet(p, founders[0])).resolves.toBeUndefined();
  });
  it("rejects a wallet on another chain before submitting anything", async () => {
    const p = {
      request: vi.fn(async ({ method }: { method: string }) =>
        method === "eth_chainId" ? "0xa" : [founders[0]],
      ),
    } as unknown as InjectedProvider;
    await expect(assertWallet(p, founders[0])).rejects.toThrow(
      "Ethereum mainnet",
    );
  });
  it("rejects an account change or disconnection", async () => {
    const p = {
      request: vi.fn(async ({ method }: { method: string }) =>
        method === "eth_chainId" ? "0x1" : [founders[1]],
      ),
    } as unknown as InjectedProvider;
    await expect(assertWallet(p, founders[0])).rejects.toThrow(
      "account changed",
    );
  });
});

it("cancels a pending action after disconnecting the site even if the extension still exposes the same account", async () => {
  const c = new Club(deployment as unknown as Deployment);
  c.verified = true;
  const p = {
    request: vi.fn(async ({ method }: { method: string }) =>
      method === "eth_chainId" ? "0x1" : [founders[0]],
    ),
  } as unknown as InjectedProvider;
  let active = true;
  const port = actionPort(c, p, founders[0], vi.fn(), () => active);
  await port.guard();
  active = false;
  await expect(port.guard()).rejects.toThrow("wallet session changed");
  await expect(port.approve(100n)).rejects.toThrow("wallet session changed");
});
