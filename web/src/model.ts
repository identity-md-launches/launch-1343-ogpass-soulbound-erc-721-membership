import { formatUnits, type Abi, type Address, type Hex } from "viem";
export interface Deployment {
  chainId: number;
  sourceCommit: string;
  manifest: { contracts: { contract: string; constructorArgs: string[] }[] };
  contracts: {
    name: string;
    address: Address;
    blockNumber: number;
    abiHash: string;
    abi: Abi;
    runtimeCodeHash: Hex;
  }[];
  poolManager: Address;
}
export interface SiteConfig {
  telegramEndpoint: string | null;
  ogEthPool: { id: Hex; currency0: Address; currency1: Address } | null;
}
export interface Snapshot {
  block: bigint;
  timestamp: bigint;
  loadedAt: number;
  currentBuyPrice: bigint;
  currentSellPrice: bigint;
  publicSupply: bigint;
  founderClaimed: bigint;
  founderOutstanding: bigint;
  reservedFounderSlots: bigint;
  curveReserve: bigint;
  founderReserve: bigint;
  MAX_SUPPLY: bigint;
  FOUNDER_BUYBACK: bigint;
  founderCount: bigint;
  founderRoot: Hex;
  claimDeadline: bigint;
  buysPaused: boolean;
}
export interface Member {
  address: Address;
  balance: bigint;
  member: boolean;
  claimed: boolean;
  tokenId?: bigint;
  founder?: boolean;
}
export interface ClubEvent {
  eventName: string;
  args: Record<string, bigint | Address>;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
}
export interface History {
  events: ClubEvent[];
  burned: bigint;
  throughBlock: bigint;
}
export function capacity(
  s: Pick<
    Snapshot,
    | "publicSupply"
    | "founderOutstanding"
    | "reservedFounderSlots"
    | "MAX_SUPPLY"
  >,
) {
  const used = s.publicSupply + s.founderOutstanding + s.reservedFounderSlots;
  return {
    used,
    soldOut: used >= s.MAX_SUPPLY,
    available: s.MAX_SUPPLY > used ? s.MAX_SUPPLY - used : 0n,
  };
}
export function og(value?: bigint, compact = false) {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: compact ? 2 : 4,
    ...(compact ? { notation: "compact" as const } : {}),
  }).format(Number(formatUnits(value, 18)));
}
export const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
export function errorText(error: unknown): string {
  const e = error as { shortMessage?: string; message?: string; code?: number };
  const text = e.shortMessage || e.message || "Unable to complete the request.";
  if (e.code === 4001 || /rejected|denied/i.test(text))
    return "Request declined in your wallet. Nothing else was submitted. You can try again.";
  if (/PriceAboveMax|PayoutBelowMin|price moved/i.test(text))
    return "The price moved. Refresh the quote and review it again. Any completed approval remains until spent or revoked.";
  if (/Expired/.test(text))
    return "This quote expired. Refresh the quote and try again.";
  if (/insufficient funds/i.test(text))
    return "Your wallet needs enough OG for the pass and ETH for network fees.";
  if (/InsufficientFounderReserve/.test(text))
    return "Buyback reserve not funded yet. Try again after it is funded.";
  return text.length > 240
    ? "The request failed. Refresh chain data and try again; check your wallet for any submitted transaction."
    : text;
}
export const DISCLAIMER =
  "OG Club passes are non-transferable membership passes that give access to a community, content and tools only. They are not an investment, and there is no promise of profit or of any price. The buy-back price follows a fixed public formula and can go down; 7.5% of every sale is burned. Julio Bravo is the largest OG holder and the contract owner. Smart contracts can have bugs; only use OG you can afford to lose. Not available where prohibited.";
