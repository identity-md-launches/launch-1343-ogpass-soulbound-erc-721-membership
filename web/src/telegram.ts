import { createSiweMessage } from "viem/siwe";
import type { Address, Hex } from "viem";
export class ComingSoon extends Error {
  constructor() {
    super("Telegram invites are coming soon.");
  }
}
export function endpointUrl(endpoint: string | null) {
  if (!endpoint) throw new ComingSoon();
  if (endpoint.startsWith("/") && !endpoint.startsWith("//")) return endpoint;
  const url = new URL(endpoint);
  if (url.protocol !== "https:")
    throw new Error("The Telegram endpoint must use HTTPS.");
  return url.toString();
}
async function jsonResponse(response: Response) {
  if (
    [404, 405, 501, 503].includes(response.status) ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw new ComingSoon();
  if (!response.ok)
    throw new Error("Unable to get a Telegram invite. Try again later.");
  return response.json();
}
export async function requestTelegramInvite(
  endpoint: string | null,
  address: Address,
  sign: (message: string) => Promise<Hex>,
  now = new Date(),
  request: typeof fetch = fetch,
) {
  const url = endpointUrl(endpoint);
  const challenge = await jsonResponse(
    await request(`${url}${url.includes("?") ? "&" : "?"}action=nonce`, {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    }),
  );
  if (
    typeof challenge.nonce !== "string" ||
    !/^[A-Za-z0-9]{8,128}$/.test(challenge.nonce)
  )
    throw new Error(
      "The invite service returned an invalid nonce. Try again later.",
    );
  const message = createSiweMessage({
    domain: "ogclub.online",
    address,
    statement:
      "Verify your OG Club membership to receive a single-use Telegram invite.",
    uri: "https://ogclub.online",
    version: "1",
    chainId: 1,
    nonce: challenge.nonce,
    issuedAt: now,
    expirationTime: new Date(now.getTime() + 300000),
  });
  const signature = await sign(message);
  const result = await jsonResponse(
    await request(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
      signal: AbortSignal.timeout(12000),
    }),
  );
  const invite = new URL(result.inviteUrl);
  if (
    invite.protocol !== "https:" ||
    invite.hostname !== "t.me" ||
    !/^\/(\+|joinchat\/)[A-Za-z0-9_-]+$/.test(invite.pathname) ||
    invite.search ||
    invite.hash
  )
    throw new Error(
      "The service returned an invalid Telegram invite. Contact the operator.",
    );
  return invite.toString();
}
