import {
  createPublicClient,
  http,
  fallback,
  erc20Abi,
  parseAbiItem,
  parseAbi,
  keccak256,
  toBytes,
  encodeAbiParameters,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import type {
  Deployment,
  Snapshot,
  Member,
  ClubEvent,
  History,
  SiteConfig,
} from "./model";
export const RPC_URLS = [
  "https://mainnet.gateway.tenderly.co",
  "https://rpc.mevblocker.io",
  "https://eth.drpc.org",
] as const;
export function makeClient(urls: readonly string[] = RPC_URLS) {
  // viem retries 429/5xx, honors numeric Retry-After, otherwise uses exponential backoff.
  return createPublicClient({
    chain: mainnet,
    transport: fallback(
      urls.map((url) =>
        http(url, {
          batch: { batchSize: 40, wait: 10 },
          retryCount: 2,
          retryDelay: 1000,
          timeout: 12000,
        }),
      ),
      { rank: false, retryCount: 0 },
    ),
    pollingInterval: 12000,
  });
}
export const client = makeClient();
export const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);
export const activityEvents = [
  parseAbiItem(
    "event Buy(address indexed buyer, uint256 indexed tokenId, uint256 price, uint256 publicSupplyAfter)",
  ),
  parseAbiItem(
    "event Sell(address indexed seller, uint256 indexed tokenId, uint256 price, uint256 payout, uint256 burned)",
  ),
  parseAbiItem(
    "event ReserveBurned(address indexed caller, uint256 amount, uint256 founderReserveAfter)",
  ),
];
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, value]) => [k, canonical(value)]),
        )
      : v;
export async function loadConfiguration(): Promise<{
  deployment: Deployment;
  config: SiteConfig;
}> {
  const [dr, cr] = await Promise.all([
    fetch("./imd-deployment.json"),
    fetch("./site-config.json"),
  ]);
  if (!dr.ok || !cr.ok)
    throw new Error(
      "Site configuration is unavailable. Reload the page or contact the site operator.",
    );
  const deployment = (await dr.json()) as Deployment;
  const config = (await cr.json()) as SiteConfig;
  const c = deployment.contracts.find((c) => c.name === "OGPass");
  if (
    deployment.chainId !== 1 ||
    !c?.abi ||
    !c.runtimeCodeHash ||
    !c.blockNumber
  )
    throw new Error("Invalid deployment handoff. Transactions are disabled.");
  if (
    keccak256(toBytes(JSON.stringify(canonical(c.abi)))).slice(2) !== c.abiHash
  )
    throw new Error(
      "The ABI does not match the deployment handoff. Transactions are disabled.",
    );
  return { deployment, config };
}
// No incomplete scan is returned. Providers with smaller limits get progressively smaller ranges.
export async function scanRanges<T>(
  start: bigint,
  end: bigint,
  read: (from: bigint, to: bigint) => Promise<T[]>,
  progress?: (through: bigint) => void,
): Promise<T[]> {
  let from = start,
    span = 5000n;
  const result: T[] = [];
  while (from <= end) {
    const to = from + span - 1n < end ? from + span - 1n : end;
    try {
      result.push(...(await read(from, to)));
      from = to + 1n;
      progress?.(to);
    } catch (e) {
      if (span <= 100n) throw e;
      span = span / 2n;
    }
  }
  return result;
}
export function survivingToken(
  mints: { args: { tokenId?: bigint } }[],
  burns: { args: { tokenId?: bigint } }[],
) {
  const burned = new Set(burns.map((l) => l.args.tokenId));
  return [...mints]
    .reverse()
    .find((l) => l.args.tokenId !== undefined && !burned.has(l.args.tokenId))
    ?.args.tokenId;
}
export class Club {
  readonly contract;
  readonly address: Address;
  readonly abi;
  readonly og: Address;
  readonly start: bigint;
  verified = false;
  constructor(
    readonly deployment: Deployment,
    readonly rpc = client,
  ) {
    this.contract = deployment.contracts.find((c) => c.name === "OGPass")!;
    this.address = this.contract.address;
    this.abi = this.contract.abi;
    this.og = deployment.manifest.contracts.find(
      (c) => c.contract === "OGPass",
    )!.constructorArgs[0] as Address;
    this.start = BigInt(this.contract.blockNumber);
  }
  async read<T = bigint>(
    name: string,
    args: readonly unknown[] = [],
    blockNumber?: bigint,
  ): Promise<T> {
    return (await this.rpc.readContract({
      address: this.address,
      abi: this.abi,
      functionName: name,
      args,
      blockNumber,
    })) as T;
  }
  async verify() {
    const [chain, code, token, decimals] = await Promise.all([
      this.rpc.getChainId(),
      this.rpc.getCode({ address: this.address }),
      this.read<Address>("OG"),
      this.rpc.readContract({
        address: this.og,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ]);
    if (
      chain !== 1 ||
      !code ||
      keccak256(code) !== this.contract.runtimeCodeHash ||
      token.toLowerCase() !== this.og.toLowerCase() ||
      decimals !== 18
    )
      throw new Error(
        "Deployment verification failed. Transactions are disabled. Check the deployment handoff with the site operator.",
      );
    this.verified = true;
  }
  async snapshot(): Promise<Snapshot> {
    const block = await this.rpc.getBlock();
    const names = [
      "currentBuyPrice",
      "currentSellPrice",
      "publicSupply",
      "founderClaimed",
      "founderOutstanding",
      "reservedFounderSlots",
      "curveReserve",
      "founderReserve",
      "MAX_SUPPLY",
      "FOUNDER_BUYBACK",
      "founderCount",
      "founderRoot",
      "claimDeadline",
      "buysPaused",
    ];
    const values = await Promise.all(
      names.map((name) => this.read(name, [], block.number)),
    );
    return {
      ...Object.fromEntries(names.map((name, i) => [name, values[i]])),
      block: block.number,
      timestamp: block.timestamp,
      loadedAt: Date.now(),
    } as unknown as Snapshot;
  }
  async prices(s: Snapshot): Promise<bigint[]> {
    const count = Number(s.publicSupply) + 100;
    const prices: bigint[] = [];
    for (let i = 1; i <= count; i += 40)
      prices.push(
        ...(await Promise.all(
          Array.from({ length: Math.min(40, count - i + 1) }, (_, j) =>
            this.read("priceOf", [BigInt(i + j)], s.block),
          ),
        )),
      );
    return prices;
  }
  async member(address: Address, block: bigint): Promise<Member> {
    const [member, claimed, balance] = await Promise.all([
      this.read<boolean>("isMember", [address], block),
      this.read<boolean>("hasClaimedFounder", [address], block),
      this.rpc.readContract({
        address: this.og,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
        blockNumber: block,
      }),
    ]);
    if (!member) return { address, member, claimed, balance };
    const read = (args: { from: Address; to: Address }) =>
      scanRanges(this.start, block, (fromBlock, toBlock) =>
        this.rpc.getLogs({
          address: this.address,
          event: transferEvent,
          args,
          fromBlock,
          toBlock,
          strict: true,
        }),
      );
    const [mints, burns] = await Promise.all([
      read({ from: zeroAddress, to: address }),
      read({ from: address, to: zeroAddress }),
    ]);
    const tokenId = survivingToken(mints, burns);
    if (tokenId === undefined)
      throw new Error(
        "Membership exists, but its unburned mint could not be found. Refresh before selling.",
      );
    const [founder, owner] = await Promise.all([
      this.read<boolean>("isFounder", [tokenId], block),
      this.read<Address>("ownerOf", [tokenId], block),
    ]);
    if (owner.toLowerCase() !== address.toLowerCase())
      throw new Error("Pass ownership changed. Refresh your membership.");
    return { address, member, claimed, balance, tokenId, founder };
  }
  async history(
    block: bigint,
    progress?: (through: bigint) => void,
  ): Promise<History> {
    // Every complete refresh starts at the handoff's deployment block. Never report a partial total.
    const logs = (await scanRanges(
      this.start,
      block,
      (fromBlock, toBlock) =>
        this.rpc.getLogs({
          address: this.address,
          events: activityEvents,
          fromBlock,
          toBlock,
          strict: true,
        }),
      progress,
    )) as unknown as ClubEvent[];
    return summarizeHistory(logs, block);
  }

  async ethSpot(
    pool: SiteConfig["ogEthPool"],
    block: bigint,
  ): Promise<number | undefined> {
    if (!pool || !/^0x[0-9a-fA-F]{64}$/.test(pool.id)) return;
    const c0 = pool.currency0.toLowerCase(),
      c1 = pool.currency1.toLowerCase();
    if (
      !(
        [c0, c1].includes(zeroAddress) &&
        [c0, c1].includes(this.og.toLowerCase())
      )
    )
      return;
    // Uniswap v4 StateLibrary: pools mapping is at slot 6; slot0 contains sqrtPriceX96 in its low 160 bits.
    const slot = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }],
        [pool.id, 6n],
      ),
    );
    const packed = await this.rpc.readContract({
      address: this.deployment.poolManager,
      abi: parseAbi(["function extsload(bytes32 slot) view returns (bytes32)"]),
      functionName: "extsload",
      args: [slot],
      blockNumber: block,
    });
    const sqrt = BigInt(packed) & ((1n << 160n) - 1n);
    if (!sqrt) return;
    const ratio = (Number(sqrt) / 2 ** 96) ** 2;
    const ethPerOg = c0 === this.og.toLowerCase() ? ratio : 1 / ratio;
    return Number.isFinite(ethPerOg) && ethPerOg > 0 ? ethPerOg : undefined;
  }
}
export function summarizeHistory(logs: ClubEvent[], block: bigint): History {
  let burned = 0n;
  for (const l of logs)
    burned +=
      l.eventName === "Sell"
        ? (l.args.burned as bigint)
        : l.eventName === "ReserveBurned"
          ? (l.args.amount as bigint)
          : 0n;
  return {
    burned,
    throughBlock: block,
    events: logs
      .filter((l) => l.eventName === "Buy" || l.eventName === "Sell")
      .sort((a, b) =>
        a.blockNumber === b.blockNumber
          ? b.logIndex - a.logIndex
          : a.blockNumber > b.blockNumber
            ? -1
            : 1,
      )
      .slice(0, 20),
  };
}
