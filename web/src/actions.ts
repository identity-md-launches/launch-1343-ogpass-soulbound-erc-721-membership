import type { Address, Hex } from "viem";
import { founderProof, founderTree } from "./founders";
export interface ActionPort {
  account: Address;
  guard(): Promise<void>;
  read<T = bigint>(name: string, args?: readonly unknown[]): Promise<T>;
  allowance(): Promise<bigint>;
  approve(amount: bigint): Promise<Hex>;
  write(name: string, args: readonly unknown[]): Promise<Hex>;
  wait(hash: Hex): Promise<void>;
  status(message: string, hash?: Hex): void;
  now(): number;
}
export class PriceMoved extends Error {
  constructor(readonly quote: bigint) {
    super(
      "The price moved. Review the new quote and approve the exact amount again.",
    );
  }
}
async function send(p: ActionPort, name: string, args: readonly unknown[]) {
  await p.guard();
  p.status("Confirm the transaction in your wallet.");
  const hash = await p.write(name, args);
  p.status("Transaction submitted. Waiting for confirmation…", hash);
  await p.wait(hash);
  p.status("Transaction confirmed.", hash);
}
export async function buyPass(p: ActionPort, quote: bigint) {
  await p.guard();
  const fresh = await p.read("currentBuyPrice");
  if (fresh !== quote) throw new PriceMoved(fresh);
  p.status("Step 1 of 2 · Approve the exact OG quote in your wallet.");
  const approval = await p.approve(quote);
  p.status("Confirming your exact-amount approval…", approval);
  await p.wait(approval);
  await p.guard();
  const next = await p.read("currentBuyPrice");
  if (next !== quote) throw new PriceMoved(next);
  if ((await p.allowance()) !== quote)
    throw new Error(
      "The allowance differs from the exact quote. Review and approve again.",
    );
  p.status("Step 2 of 2 · Confirm your membership purchase.");
  await send(p, "buy", [quote, BigInt(Math.floor(p.now() / 1000) + 600)]);
}
export async function sellPass(p: ActionPort, tokenId: bigint, payout: bigint) {
  await p.guard();
  const fresh = await p.read("currentSellPrice");
  if (fresh !== payout) throw new PriceMoved(fresh);
  await send(p, "sell", [
    tokenId,
    payout,
    BigInt(Math.floor(p.now() / 1000) + 600),
  ]);
}
export async function claimPass(p: ActionPort) {
  await p.guard();
  const [root, claimed, member, deadline] = await Promise.all([
    p.read<Hex>("founderRoot"),
    p.read<boolean>("hasClaimedFounder", [p.account]),
    p.read<boolean>("isMember", [p.account]),
    p.read("claimDeadline"),
  ]);
  if (root.toLowerCase() !== founderTree.root.toLowerCase())
    throw new Error("Founder root mismatch. Claim is unavailable.");
  if (claimed || member)
    throw new Error(
      "You already claimed or hold a pass. Refresh your membership.",
    );
  if (BigInt(Math.floor(p.now() / 1000)) >= deadline)
    throw new Error("The founder claim window has closed.");
  const proof = founderProof(p.account);
  if (!proof) throw new Error("This address is not on the founder list.");
  await send(p, "claimFounder", [proof]);
}
export async function sellFounderPass(p: ActionPort, tokenId: bigint) {
  await p.guard();
  const [reserve, required] = await Promise.all([
    p.read("founderReserve"),
    p.read("FOUNDER_BUYBACK"),
  ]);
  if (reserve < required) throw new Error("Buyback reserve not funded yet.");
  await send(p, "sellFounder", [tokenId]);
}
