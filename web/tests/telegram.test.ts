import { describe, it, expect, vi } from "vitest";
import { parseSiweMessage } from "viem/siwe";
import { requestTelegramInvite, ComingSoon } from "../src/telegram";
import { founders } from "../src/founders";
import type { Hex } from "viem";
const signature = "0x1234" as Hex;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
describe("SIWE invite boundary", () => {
  it("signs a server nonce, correct domain/chain, and five-minute expiration; POSTs only message and signature", async () => {
    const now = new Date("2026-10-12T00:00:00Z");
    const sign = vi.fn(async () => signature);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ nonce: "abcdefgh12345678" }))
      .mockResolvedValueOnce(json({ inviteUrl: "https://t.me/+abc123" }));
    const result = await requestTelegramInvite(
      "/api/tg-invite",
      founders[0],
      sign,
      now,
      fetcher,
    );
    expect(result).toBe("https://t.me/+abc123");
    const body = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(Object.keys(body).sort()).toEqual(["message", "signature"]);
    const m = parseSiweMessage(body.message);
    expect(m.domain).toBe("ogclub.online");
    expect(m.chainId).toBe(1);
    expect(m.nonce).toBe("abcdefgh12345678");
    expect(m.expirationTime!.getTime() - m.issuedAt!.getTime()).toBe(300000);
    expect(fetcher.mock.calls[0][0]).toBe("/api/tg-invite?action=nonce");
  });
  it.each([null, "/api/tg-invite"])(
    "shows coming soon without signing for an absent backend: %s",
    async (endpoint) => {
      const sign = vi.fn();
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response("Not found", { status: 404 }));
      await expect(
        requestTelegramInvite(endpoint, founders[0], sign, new Date(), fetcher),
      ).rejects.toBeInstanceOf(ComingSoon);
      expect(sign).not.toHaveBeenCalled();
    },
  );
  it("treats a static host HTML fallback as an absent endpoint", async () => {
    const sign = vi.fn();
    await expect(
      requestTelegramInvite(
        "/api/tg-invite",
        founders[0],
        sign,
        new Date(),
        vi
          .fn()
          .mockResolvedValue(
            new Response("<html/>", {
              headers: { "Content-Type": "text/html" },
            }),
          ),
      ),
    ).rejects.toBeInstanceOf(ComingSoon);
    expect(sign).not.toHaveBeenCalled();
  });
  it("rejects a malformed nonce before signing", async () => {
    const sign = vi.fn();
    await expect(
      requestTelegramInvite(
        "/api/tg-invite",
        founders[0],
        sign,
        new Date(),
        vi.fn().mockResolvedValue(json({ nonce: "oops" })),
      ),
    ).rejects.toThrow("invalid nonce");
    expect(sign).not.toHaveBeenCalled();
  });
  it("rejects non-Telegram invite URLs", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ nonce: "abcdefgh12345678" }))
      .mockResolvedValueOnce(json({ inviteUrl: "https://evil.example/" }));
    await expect(
      requestTelegramInvite(
        "/api/tg-invite",
        founders[0],
        async () => signature,
        new Date(),
        fetcher,
      ),
    ).rejects.toThrow("invalid Telegram");
  });
  it("does not POST if the signature is rejected", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(json({ nonce: "abcdefgh12345678" }));
    await expect(
      requestTelegramInvite(
        "/api/tg-invite",
        founders[0],
        async () => {
          throw new Error("rejected");
        },
        new Date(),
        fetcher,
      ),
    ).rejects.toThrow("rejected");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
