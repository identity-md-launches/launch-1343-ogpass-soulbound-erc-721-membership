import { useEffect, useRef, useState, type ReactNode } from "react";
import { createWalletClient, custom, formatUnits, type Hex } from "viem";
import { mainnet } from "viem/chains";
import { Club, loadConfiguration } from "./chain";
import {
  buyPass,
  sellPass,
  claimPass,
  sellFounderPass,
  PriceMoved,
} from "./actions";
import { actionPort, assertWallet, useWallet } from "./wallet";
import { founderProof, founderTree } from "./founders";
import {
  capacity,
  DISCLAIMER,
  errorText,
  og,
  shortAddress,
  type Snapshot,
  type Member,
  type History,
  type SiteConfig,
} from "./model";
import { ComingSoon, requestTelegramInvite } from "./telegram";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}
function External({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
      <Arrow diagonal />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="dialog-title"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={() => ref.current?.close()}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Curve({
  prices,
  supply,
}: {
  prices: bigint[];
  supply: bigint;
}) {
  const [selected, setSelected] = useState(1);
  useEffect(() => setSelected(Math.max(1, Number(supply))), [supply]);
  if (!prices.length)
    return (
      <div className="chart-empty">
        The price curve appears once the contract reads are available.
      </div>
    );
  const n = Math.min(selected, prices.length),
    max = Number(prices[prices.length - 1]),
    min = Number(prices[0]);
  const x = (i: number) => 28 + ((i - 1) / (prices.length - 1)) * 704,
    y = (p: bigint) => 182 - ((Number(p) - min) / (max - min || 1)) * 150;
  const points = prices.map((p, i) => `${x(i + 1)},${y(p)}`).join(" ");
  const current = Number(supply);
  return (
    <>
      <div className="chart-legend">
        <span>
          <i className="legend-line" />
          Price per public pass
        </span>
        <span className="muted">OG</span>
      </div>
      <svg
        className="curve-svg"
        viewBox="0 0 760 220"
        role="img"
        aria-label={`Public price curve for pass 1 through ${prices.length}. Current public supply: ${supply}. Selected pass ${n}: ${og(prices[n - 1])} OG.`}
      >
        <defs>
          <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity=".18" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[32, 82, 132, 182].map((v) => (
          <line key={v} x1="28" x2="732" y1={v} y2={v} className="grid-line" />
        ))}
        <polygon points={`28,182 ${points} 732,182`} fill="url(#curve-fill)" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="2.5"
        />
        {current > 0 && (
          <>
            <line
              x1={x(current)}
              x2={x(current)}
              y1="22"
              y2="190"
              stroke="var(--text)"
              strokeDasharray="4 5"
            />
            <circle
              cx={x(current)}
              cy={y(prices[current - 1])}
              r="5"
              fill="var(--text)"
            />
          </>
        )}
        <circle
          cx={x(n)}
          cy={y(prices[n - 1])}
          r="5"
          fill="var(--gold)"
          stroke="var(--surface)"
          strokeWidth="2"
        />
        {current === 0 && (
          <line
            x1="12"
            x2="12"
            y1="22"
            y2="190"
            stroke="var(--text)"
            strokeDasharray="4 5"
          />
        )}
      </svg>
      <div className="chart-axis">
        <span>Pass 1 · {og(prices[0], true)} OG</span>
        <span>
          Pass {prices.length} · {og(prices[prices.length - 1], true)} OG
        </span>
      </div>
      <p className="caption">
        Current supply: {supply.toString()}.{" "}
        {supply === 0n
          ? "The first public pass starts the curve."
          : "Marked by the white dashed line."}
      </p>
      <div className="chart-readout">
        <label htmlFor="curve-point">
          Explore pass <strong>#{n}</strong>
        </label>
        <output htmlFor="curve-point">{og(prices[n - 1])} OG</output>
      </div>
      <input
        id="curve-point"
        type="range"
        min="1"
        max={prices.length}
        value={n}
        onChange={(e) => setSelected(Number(e.target.value))}
      />
    </>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: string;
}) {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note && <dd className="caption metric-note">{note}</dd>}
    </div>
  );
}
export default function App() {
  const wallet = useWallet();
  const [club, setClub] = useState<Club>();
  const [config, setConfig] = useState<SiteConfig>();
  const [s, setS] = useState<Snapshot>();
  const [member, setMember] = useState<Member>();
  const [memberError, setMemberError] = useState("");
  const [history, setHistory] = useState<History>();
  const [historyError, setHistoryError] = useState("");
  const [prices, setPrices] = useState<bigint[]>([]);
  const [priceError, setPriceError] = useState("");
  const lastCurveSupply = useRef<bigint | undefined>(undefined);
  const [spot, setSpot] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const refreshing = useRef(false);
  const [modal, setModal] = useState<
    "wallet" | "buy" | "sell" | "founder" | null
  >(null);
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [busy, setBusy] = useState(false);
  const actionBusy = useRef(false);
  const [status, setStatus] = useState("");
  const [actionError, setActionError] = useState("");
  const [tx, setTx] = useState<Hex>();
  const [reviewQuote, setReviewQuote] = useState<bigint>();
  const [accepted, setAccepted] = useState(false);
  const [invite, setInvite] = useState("");
  const [telegramSoon, setTelegramSoon] = useState(false);
  useEffect(() => {
    let active = true;
    loadConfiguration()
      .then(async (loaded) => {
        const c = new Club(loaded.deployment);
        await c.verify();
        if (active) {
          setClub(c);
          setConfig(loaded.config);
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorText(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function refresh(c = club) {
    if (!c || refreshing.current) return;
    refreshing.current = true;
    setLoading(true);
    try {
      const next = await c.snapshot();
      setS(next);
      setError("");
      await Promise.allSettled([
        c
          .history(next.block)
          .then(setHistory)
          .then(() => setHistoryError(""))
          .catch(() =>
            setHistoryError(
              "Activity could not be fully scanned. Retry to load the burn total and recent activity.",
            ),
          ),
        lastCurveSupply.current === next.publicSupply
          ? Promise.resolve()
          : c
              .prices(next)
              .then((p) => {
                setPrices(p);
                lastCurveSupply.current = next.publicSupply;
                setPriceError("");
              })
              .catch(() =>
                setPriceError(
                  "The price curve is unavailable. Refresh to retry.",
                ),
              ),
        c
          .ethSpot(config?.ogEthPool || null, next.block)
          .then(setSpot)
          .catch(() => setSpot(undefined)),
      ]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      refreshing.current = false;
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!club) return;
    void refresh(club);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(club);
    }, 30000);
    return () => clearInterval(timer);
  }, [club, config]);
  useEffect(() => {
    setMember(undefined);
    setMemberError("");
    let active = true;
    if (club && wallet.address && s)
      club
        .member(wallet.address, s.block)
        .then((m) => {
          if (active) {
            setMember(m);
            if (!m.member) setInvite("");
          }
        })
        .catch((e) => {
          if (active) setMemberError(errorText(e));
        });
    return () => {
      active = false;
    };
  }, [club, wallet.address, s]);
  useEffect(() => {
    setInvite("");
  }, [wallet.address]);
  useEffect(() => {
    setModal(null);
    setAccepted(false);
    setActionError("");
  }, [wallet.address, wallet.chainId]);
  const connectedMember =
    member && member.address === wallet.address ? member : undefined;
  const cap = s ? capacity(s) : undefined;
  const stale = !!s && now - s.loadedAt > 90000;
  const ready = !!club?.verified && !!s && !error && !stale;
  const mainnetReady = wallet.chainId === 1;
  const canBuy =
    ready &&
    !!connectedMember &&
    !connectedMember.member &&
    !s?.buysPaused &&
    !cap?.soldOut &&
    mainnetReady &&
    !busy;
  const rootValid =
    !!s && founderTree.root.toLowerCase() === s.founderRoot.toLowerCase();
  const eligible = !!wallet.address && !!founderProof(wallet.address);
  const seconds = s
    ? Math.max(0, Number(s.claimDeadline) - Math.floor(now / 1000))
    : undefined;
  const claimOpen = seconds !== undefined && seconds > 0;
  const canClaim =
    ready &&
    mainnetReady &&
    rootValid &&
    eligible &&
    connectedMember &&
    !connectedMember.claimed &&
    !connectedMember.member &&
    claimOpen &&
    !busy;
  const funded = !!s && s.founderReserve >= s.FOUNDER_BUYBACK;
  const founderSale = mode === "sell" && !!connectedMember?.founder;
  const actionQuote =
    mode === "buy"
      ? s?.currentBuyPrice
      : founderSale
        ? s?.FOUNDER_BUYBACK
        : s?.currentSellPrice;
  const eth = (amount?: bigint) =>
    spot && amount !== undefined
      ? `≈ ${(Number(formatUnits(amount, 18)) * spot).toLocaleString("en-US", { maximumSignificantDigits: 5 })} ETH · spot estimate`
      : undefined;
  const report = (message: string, hash?: Hex) => {
    setStatus(message);
    if (hash) setTx(hash);
  };
  async function run(fn: () => Promise<void>) {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setActionError("");
    setStatus("");
    setTx(undefined);
    try {
      await fn();
      setModal(null);
    } catch (e) {
      setActionError(errorText(e));
      setStatus("");
      if (e instanceof PriceMoved) {
        setReviewQuote(e.quote);
        setAccepted(false);
      }
    } finally {
      actionBusy.current = false;
      setBusy(false);
      void refresh();
    }
  }
  function port() {
    if (!club || !wallet.selected || !wallet.address)
      throw new Error("Connect your wallet first.");
    const version = wallet.sessionVersion();
    return actionPort(
      club,
      wallet.selected.provider,
      wallet.address,
      report,
      () => wallet.sessionVersion() === version,
    );
  }
  function review(kind: "buy" | "sell" | "founder") {
    setAccepted(false);
    setActionError("");
    setStatus("");
    setReviewQuote(kind === "buy" ? s?.currentBuyPrice : s?.currentSellPrice);
    setModal(kind);
  }
  const walletControl = (
    <button className="button wallet-button" onClick={() => setModal("wallet")}>
      {wallet.address ? shortAddress(wallet.address) : "Connect wallet"}
      <span aria-hidden="true">{wallet.address ? "◉" : "↗"}</span>
    </button>
  );
  const notices = (
    <div className="transaction-status" aria-live="polite" aria-atomic="true">
      {status && <p>{status}</p>}
      {tx && (
        <External href={`https://etherscan.io/tx/${tx}`}>
          View transaction
        </External>
      )}
      {actionError && (
        <p role="alert" className="error">
          {actionError}
        </p>
      )}
    </div>
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#main" aria-label="OG Club home">
          <img src="./favicon.svg" width="42" height="42" alt="" />
          <span>
            OG Club
            <span className="brand-note">A place for the originals.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#curve">The curve</a>
          <a href="#founders">Founders</a>
          <a href="#members">Members</a>
        </nav>
        <div className="wallet-zone">
          {connectedMember && (
            <span className="wallet-balance">
              {og(connectedMember.balance, true)} OG{" "}
              {connectedMember.member && (
                <b className="badge">
                  {connectedMember.founder ? "FOUNDER" : "PUBLIC"}
                </b>
              )}
            </span>
          )}
          {walletControl}
        </div>
      </header>
      <main id="main">
        <div className="network-row">
          <span className="network-tag">
            <span className="status-dot" />
            Ethereum mainnet
          </span>
          <span className="caption">One wallet. One pass.</span>
        </div>
        {wallet.address && !mainnetReady && (
          <div className="notice error" role="alert">
            Your wallet is on another network.{" "}
            <button
              className="button"
              disabled={busy}
              onClick={() => void run(() => wallet.switchChain())}
            >
              Switch to Ethereum
            </button>
          </div>
        )}
        {(error || stale) && (
          <div className="notice error" role="alert">
            {error ||
              "Chain data is more than 90 seconds old. Refresh before making a transaction."}
            <button
              className="button"
              disabled={loading}
              onClick={() => (club ? void refresh() : window.location.reload())}
            >
              Retry chain reads
            </button>
          </div>
        )}
        {memberError && (
          <div className="notice error" role="alert">
            {memberError}
            <button className="button" onClick={() => void refresh()}>
              Retry membership
            </button>
          </div>
        )}
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">
              Buy your <em>OG Club</em> pass.
            </h1>
            <p className="hero-description">
              A non-transferable Ethereum membership for community, content and
              tools.
            </p>
            <div className="hero-links">
              <a href="#members">
                Explore the club <Arrow />
              </a>
              <External href="https://og-swarm-map.sites.imd.fun/">
                Swarm map
              </External>
            </div>
            <div className="membership-notes">
              <span>◈ Community access</span>
              <span>◇ On-chain membership</span>
            </div>
          </div>
          <section className="pass-card" aria-labelledby="pass-title">
            <div className="pass-top">
              <div>
                <span className="caption">OG Club membership</span>
                <h2 id="pass-title">The OG Pass</h2>
              </div>
              <div className="pass-seal" aria-hidden="true">
                OG<span>✦</span>
              </div>
            </div>
            <div className="pass-detail">
              <span>Non-transferable</span>
              <span>Ethereum · ERC-721</span>
            </div>
            <div className="segment" aria-label="Membership action">
              <button
                aria-pressed={mode === "buy"}
                onClick={() => setMode("buy")}
              >
                Buy a pass
              </button>
              <button
                aria-pressed={mode === "sell"}
                onClick={() => setMode("sell")}
              >
                Sell a pass
              </button>
            </div>
            <div className="quote">
              <span className="caption">
                {mode === "buy"
                  ? "Current buy price"
                  : founderSale
                    ? "Fixed founder buyback"
                    : "Current public sell payout"}
              </span>
              <div className="quote-value">
                {og(actionQuote)} <span>OG</span>
              </div>
              {eth(actionQuote) && (
                <p className="caption">{eth(actionQuote)}</p>
              )}
            </div>
            {mode === "buy" ? (
              <>
                {!wallet.address ? (
                  <button
                    className="button primary"
                    onClick={() => setModal("wallet")}
                  >
                    Connect wallet to join <Arrow />
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={!canBuy}
                    onClick={() => review("buy")}
                  >
                    {busy
                      ? "Transaction in progress…"
                      : cap?.soldOut
                        ? "Sold out"
                        : connectedMember?.member
                          ? "You’re already a member"
                          : s?.buysPaused
                            ? "New buys are paused"
                            : !mainnetReady
                              ? "Switch to Ethereum"
                              : !connectedMember
                                ? "Checking membership…"
                                : "Review membership purchase"}
                    <Arrow />
                  </button>
                )}
                <p className="caption">
                  Exact OG approval, then purchase. ETH is needed for gas.
                </p>
              </>
            ) : (
              <>
                {!wallet.address ? (
                  <button
                    className="button primary"
                    onClick={() => setModal("wallet")}
                  >
                    Connect wallet to view your pass <Arrow />
                  </button>
                ) : connectedMember?.member ? (
                  <button
                    className="button primary"
                    disabled={
                      !ready ||
                      !mainnetReady ||
                      busy ||
                      (connectedMember.founder && !funded)
                    }
                    onClick={() =>
                      review(connectedMember.founder ? "founder" : "sell")
                    }
                  >
                    {connectedMember.founder
                      ? funded
                        ? "Review founder buyback"
                        : "Buyback reserve not funded yet"
                      : "Review sale"}
                  </button>
                ) : (
                  <p className="notice">
                    {connectedMember
                      ? "This wallet has no pass to sell."
                      : "Checking your membership…"}
                  </p>
                )}
                <p className="caption">
                  {founderSale
                    ? "You lose membership and can never claim again."
                    : "Public sale: you receive 92.5%; 7.5% is burned. Selling ends your membership."}
                </p>
              </>
            )}
            <div className="pass-bottom">
              <span>
                {s
                  ? `${cap!.available.toLocaleString()} slots available`
                  : "Reading supply…"}
              </span>
              <span>1,000 maximum</span>
            </div>
          </section>
        </section>
        {notices}
        <aside className="risk-note">
          <span className="risk-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>Membership, with a public price formula.</strong>
            <p>
              Early buyers can sell above what late buyers paid. Late buyers
              lose at least 7.5% if they sell, and can lose more as supply
              falls. Never send OG directly to the contract: it is stuck
              forever.
            </p>
            <a href="#disclaimer">
              Read the full membership disclaimer <Arrow />
            </a>
          </div>
        </aside>
        <section id="curve" className="section" aria-labelledby="curve-title">
          <div className="section-heading">
            <div>
              <h2 id="curve-title">The curve, in the open.</h2>
              <p>Every public pass follows the same on-chain formula.</p>
            </div>
            <button
              className="button subtle"
              disabled={loading}
              onClick={() => void refresh()}
            >
              {loading ? "Refreshing…" : "Refresh data"}{" "}
              <span aria-hidden="true">↻</span>
            </button>
          </div>
          <div className="curve-layout">
            <div className="panel curve-panel">
              <div className="panel-heading">
                <h3>Public price curve</h3>
                <span className="badge">Linear pricing</span>
              </div>
              <p className="caption">P(n) = 1,000,000 + 10,000 × (n − 1) OG</p>
              {priceError ? (
                <p className="error" role="alert">
                  {priceError}
                </p>
              ) : (
                <Curve prices={prices} supply={s?.publicSupply || 0n} />
              )}
              <div className="curve-prices">
                <span>
                  Buy <strong>{og(s?.currentBuyPrice)} OG</strong>
                </span>
                <span>
                  Sell payout <strong>{og(s?.currentSellPrice)} OG</strong>
                </span>
              </div>
              <p className="caption chart-footnote">
                Shown through public supply + 100. This is the contract formula,
                not a forecast. Sell payouts are 92.5% of the current curve
                price.
              </p>
            </div>
            <div className="panel supply-panel">
              <h3>Inside the club</h3>
              <dl className="supply-grid">
                <Metric
                  label="Public passes"
                  value={s?.publicSupply.toLocaleString() || "—"}
                />
                <Metric
                  label="Founders holding"
                  value={s?.founderOutstanding.toLocaleString() || "—"}
                />
                <Metric
                  label="Founder claims"
                  value={s ? `${s.founderClaimed} / ${s.founderCount}` : "—"}
                />
                <Metric
                  label="Reserved founder slots"
                  value={s?.reservedFounderSlots.toLocaleString() || "—"}
                />
              </dl>
              <div className="capacity-line">
                <span>Supply allocation</span>
                <strong>{s ? `${cap!.used} / ${s.MAX_SUPPLY}` : "—"}</strong>
              </div>
              <progress
                aria-label="Supply allocation including reserved founders"
                value={cap ? Number(cap.used) : 0}
                max={s ? Number(s.MAX_SUPPLY) : 1000}
              />
              <p className="caption">
                {cap?.soldOut
                  ? "Sold out. New buys revert until a slot opens."
                  : "Public + held founder passes + reserved founder slots count toward the cap."}
              </p>
            </div>
          </div>
          <dl className="reserve-grid">
            <Metric
              label="Public curve reserve"
              value={
                <>
                  {og(s?.curveReserve, true)} <small>OG</small>
                </>
              }
              note="Backs public-pass sales"
            />
            <Metric
              label="Founder buyback reserve"
              value={
                <>
                  {og(s?.founderReserve, true)} <small>OG</small>
                </>
              }
              note={
                !s
                  ? "Reading reserve…"
                  : funded
                    ? `Funds ${s.founderReserve / s.FOUNDER_BUYBACK} fixed buybacks`
                    : "Buyback reserve not funded yet"
              }
            />
            <Metric
              label="OG burned by the club"
              value={
                <>
                  {historyError ? "Unavailable" : og(history?.burned, true)}{" "}
                  <small>OG</small>
                </>
              }
              note="Public sale burns + reserve burns"
            />
          </dl>
          <p className="caption data-source">
            {s
              ? `State at block ${s.block.toLocaleString()} · ${new Date(s.loadedAt).toLocaleTimeString()} · ${stale ? "stale" : "refreshes every 30 seconds"}`
              : "Reading the Ethereum contract…"}
            {history && !historyError
              ? ` · Burns and activity scanned through ${history.throughBlock.toLocaleString()}`
              : ""}
          </p>
        </section>
        <section
          id="founders"
          className="section founder-section"
          aria-labelledby="founder-title"
        >
          <div className="founder-intro">
            <span className="founder-emblem" aria-hidden="true">
              ✦
            </span>
            <h2 id="founder-title">For the original 49.</h2>
            <p>
              The founder list is fixed. If your wallet is on it, claim your
              membership before the window closes.
            </p>
            <span className="badge">
              {s
                ? claimOpen
                  ? "Claims open"
                  : "Claims closed"
                : "Checking claim window…"}
            </span>
          </div>
          <div className="founder-body">
            <div className="countdown">
              <span className="caption">Founder claim window</span>
              <strong>
                {seconds === undefined
                  ? "—"
                  : seconds === 0
                    ? "Closed"
                    : `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`}
              </strong>
              {s && (
                <span className="caption">
                  Ends {new Date(Number(s.claimDeadline) * 1000).toUTCString()}
                </span>
              )}
            </div>
            {s && !rootValid && (
              <p className="error" role="alert">
                Founder list mismatch: this tree does not match founderRoot() on
                chain. Claim is hidden.
              </p>
            )}
            {!wallet.address ? (
              <button className="button" onClick={() => setModal("wallet")}>
                Connect to check eligibility <Arrow />
              </button>
            ) : connectedMember?.claimed ? (
              <p className="notice">
                This wallet has already claimed. A founder pass can only be
                claimed once.
              </p>
            ) : connectedMember?.member ? (
              <p className="notice">
                {eligible
                  ? "You hold a public pass. Sell it before claiming; claimFounder reverts while you are a member."
                  : "You already hold a membership pass."}
              </p>
            ) : !eligible ? (
              <p className="notice">
                This wallet is not on the 49-address founder list.
              </p>
            ) : rootValid && claimOpen ? (
              <button
                className="button"
                disabled={!canClaim}
                onClick={() => void run(() => claimPass(port()))}
              >
                {busy ? "Transaction in progress…" : "Claim founder pass"}{" "}
                <Arrow />
              </button>
            ) : null}
            <div className="founder-reserve">
              <strong>
                Fixed buyback: {og(s?.FOUNDER_BUYBACK || 100000n * 10n ** 18n)}{" "}
                OG
              </strong>
              <p>
                Funded reserve: {og(s?.founderReserve)} OG.{" "}
                {s
                  ? funded
                    ? `Enough for ${s.founderReserve / s.FOUNDER_BUYBACK} buybacks; ${s.founderOutstanding} founder passes are held.`
                    : "Buyback reserve not funded yet."
                  : "Reading chain state…"}
              </p>
              {connectedMember?.founder && (
                <>
                  <p className="warning">
                    If you sell your founder pass, you lose membership and can
                    never claim again.
                  </p>
                  <button
                    className="button danger"
                    disabled={!funded || busy || !mainnetReady || !ready}
                    onClick={() => review("founder")}
                  >
                    {funded
                      ? "Review founder buyback"
                      : "Buyback reserve not funded yet"}
                  </button>
                </>
              )}
            </div>
            <p className="caption">
              A founder who holds a public pass must sell it before claiming.
              After the claim deadline, anyone can burn founder buyback reserve
              not needed for held founder passes. Never send OG directly to the
              contract: it is stuck forever.
            </p>
          </div>
        </section>
        <section
          id="members"
          className="section"
          aria-labelledby="members-title"
        >
          <div className="section-heading">
            <div>
              <h2 id="members-title">Your place in the club.</h2>
              <p>
                {connectedMember?.member
                  ? "Your pass unlocks this member area."
                  : "A community with more to explore."}
              </p>
            </div>
            <span className="badge">
              {connectedMember?.member
                ? `${connectedMember.founder ? "FOUNDER" : "PUBLIC"} · Pass #${connectedMember.tokenId}`
                : "Members’ area"}
            </span>
          </div>
          {connectedMember?.member ? (
            <>
              <div className="member-grid">
                <article className="panel">
                  <span className="tile-icon" aria-hidden="true">
                    ✧
                  </span>
                  <h3>Alpha</h3>
                  <p>Community research and conversations.</p>
                  <span className="caption">Content coming soon</span>
                </article>
                <article className="panel">
                  <span className="tile-icon" aria-hidden="true">
                    ▤
                  </span>
                  <h3>Launch digests</h3>
                  <p>A place for the launches on our radar.</p>
                  <span className="caption">Digests coming soon</span>
                </article>
                <article className="panel">
                  <span className="tile-icon" aria-hidden="true">
                    ⌘
                  </span>
                  <h3>Tools</h3>
                  <External href="https://og-swarm-map.sites.imd.fun/">
                    Explore the Swarm map
                  </External>
                  <a href="#auction-tools">
                    Auction tools <Arrow />
                  </a>
                  <p id="auction-tools" className="caption">
                    Auction tools are coming soon.
                  </p>
                </article>
              </div>
              <div className="telegram-row">
                <div>
                  <h3>Continue the conversation.</h3>
                  <p>
                    A signature verifies membership. It does not send a
                    transaction.
                  </p>
                </div>
                {invite ? (
                  <External className="button" href={invite}>
                    Open your single-use Telegram invite
                  </External>
                ) : (
                  <button
                    className="button"
                    disabled={busy || !mainnetReady || telegramSoon}
                    onClick={() =>
                      void run(async () => {
                        try {
                          const provider = wallet.selected!.provider;
                          const version = wallet.sessionVersion();
                          await assertWallet(provider, wallet.address!);
                          const wc = createWalletClient({
                            account: wallet.address!,
                            chain: mainnet,
                            transport: custom(provider),
                          });
                          report("Checking invite availability…");
                          const url = await requestTelegramInvite(
                            config?.telegramEndpoint ?? null,
                            wallet.address!,
                            async (message) => {
                              if (wallet.sessionVersion() !== version)
                                throw new Error(
                                  "The wallet session changed. Reconnect before requesting an invite.",
                                );
                              await assertWallet(provider, wallet.address!);
                              report(
                                "Sign the five-minute membership verification in your wallet.",
                              );
                              return wc.signMessage({ message });
                            },
                          );
                          if (wallet.sessionVersion() !== version)
                            throw new Error(
                              "The wallet session changed. Reconnect before requesting an invite.",
                            );
                          setInvite(url);
                          report("Your single-use Telegram invite is ready.");
                        } catch (e) {
                          if (e instanceof ComingSoon) {
                            setTelegramSoon(true);
                            report("Telegram invites are coming soon.");
                          } else throw e;
                        }
                      })
                    }
                  >
                    {telegramSoon
                      ? "Telegram · coming soon"
                      : busy
                        ? "Request in progress…"
                        : "Join the members’ Telegram"}
                    <Arrow />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="member-locked">
              <span className="tile-icon" aria-hidden="true">
                ◇
              </span>
              <div>
                <h3>A pass opens the door.</h3>
                <p>
                  Connect a member wallet to access Alpha, Launch digests and
                  Tools.
                </p>
              </div>
              <button
                className="button"
                onClick={() =>
                  wallet.address
                    ? document.getElementById("pass-title")?.scrollIntoView()
                    : setModal("wallet")
                }
              >
                {wallet.address ? "View membership" : "Connect wallet"}{" "}
                <Arrow />
              </button>
            </div>
          )}
          <p className="caption">
            Static content is not secret. The wallet check controls the
            interface, not access to files. Never put confidential content on
            this site.
          </p>
        </section>
        <section className="section" aria-labelledby="activity-title">
          <div className="section-heading">
            <div>
              <h2 id="activity-title">On-chain activity</h2>
              <p>
                The latest 20 public buys and sells. Every transaction is
                verifiable.
              </p>
            </div>
            {club && (
              <External href={`https://etherscan.io/address/${club.address}`}>
                View contract
              </External>
            )}
          </div>
          {historyError ? (
            <p className="notice error" role="alert">
              {historyError}
              <button className="button" onClick={() => void refresh()}>
                Retry activity
              </button>
            </p>
          ) : !history ? (
            <p className="empty-state">
              Scanning activity from deployment block 26,171,777…
            </p>
          ) : !history.events.length ? (
            <p className="empty-state">
              No public buys or sells yet. Confirmed activity will appear here.
            </p>
          ) : (
            <div
              className="table-wrap"
              role="region"
              aria-label="Latest buys and sells"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Wallet</th>
                    <th>Pass</th>
                    <th>Amount (OG)</th>
                    <th>Block</th>
                  </tr>
                </thead>
                <tbody>
                  {history.events.map((event) => (
                    <tr key={`${event.transactionHash}-${event.logIndex}`}>
                      <td>
                        <span
                          className={`event-tag ${event.eventName.toLowerCase()}`}
                        >
                          {event.eventName}
                        </span>
                      </td>
                      <td>
                        <External
                          href={`https://etherscan.io/address/${event.args.buyer || event.args.seller}`}
                        >
                          {shortAddress(
                            String(event.args.buyer || event.args.seller),
                          )}
                        </External>
                      </td>
                      <td>#{String(event.args.tokenId)}</td>
                      <td>
                        {og(
                          (event.eventName === "Buy"
                            ? event.args.price
                            : event.args.payout) as bigint,
                        )}
                        <small>
                          {event.eventName === "Buy" ? " paid" : " received"}
                        </small>
                      </td>
                      <td>
                        <External
                          href={`https://etherscan.io/tx/${event.transactionHash}`}
                        >
                          {event.blockNumber.toLocaleString()}
                        </External>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <footer id="disclaimer">
          <div className="footer-heading">
            <a href="#main" className="brand">
              <img src="./favicon.svg" width="32" height="32" alt="" />
              OG Club
            </a>
            <span>Community. Content. Tools.</span>
          </div>
          <p>{DISCLAIMER}</p>
          <div className="footer-meta">
            <span>No analytics. No trackers.</span>
            {club && (
              <External href={`https://etherscan.io/address/${club.address}`}>
                OGPass · {shortAddress(club.address)}
              </External>
            )}
            <External href="https://og-swarm-map.sites.imd.fun/">
              OG Swarm map
            </External>
          </div>
        </footer>
      </main>
      {modal === "wallet" && (
        <Modal
          title={wallet.address ? "Connected wallet" : "Connect your wallet"}
          onClose={() => setModal(null)}
        >
          <p>
            Choose an injected wallet. Connection never requests a seed phrase
            or private key.
          </p>
          {wallet.address && (
            <>
              <p className="full-address">{wallet.address}</p>
              <p>
                {connectedMember
                  ? `${og(connectedMember.balance)} OG`
                  : "Reading OG balance…"}
              </p>
              <button
                className="button"
                onClick={() => {
                  wallet.disconnect();
                  setModal(null);
                }}
              >
                Disconnect from this site
              </button>
            </>
          )}
          {wallet.wallets.length ? (
            <div className="wallet-list">
              {wallet.wallets.map((w) => (
                <button
                  className="button"
                  disabled={busy}
                  key={w.info.uuid}
                  onClick={() => void run(() => wallet.connect(w))}
                >
                  <span className="wallet-avatar" aria-hidden="true">
                    {w.info.name.slice(0, 1)}
                  </span>
                  {w.info.name}
                  <Arrow />
                </button>
              ))}
            </div>
          ) : (
            <div className="notice">
              <strong>No injected wallet found.</strong>
              <p>
                Open this site in your wallet’s browser or enable a browser
                wallet extension, then reload.
              </p>
              <button
                className="button"
                onClick={() => window.location.reload()}
              >
                Reload wallet discovery
              </button>
            </div>
          )}
          {notices}
        </Modal>
      )}
      {modal && modal !== "wallet" && (
        <Modal
          title={
            modal === "buy"
              ? "Review your membership"
              : modal === "founder"
                ? "Sell your founder pass"
                : "Sell your public pass"
          }
          onClose={() => setModal(null)}
        >
          <div className="review-amount">
            <span>
              {modal === "buy"
                ? "Maximum price"
                : modal === "founder"
                  ? "Fixed payout"
                  : "Minimum payout · 92.5%"}
            </span>
            <strong>
              {og(modal === "founder" ? s?.FOUNDER_BUYBACK : reviewQuote)} OG
            </strong>
          </div>
          {modal === "buy" ? (
            <>
              <p>
                Approve exactly {og(reviewQuote)} OG, then buy. Both steps
                require wallet confirmation; no unlimited allowance is
                requested. The purchase deadline is 10 minutes.
              </p>
              <div className="disclaimer-box">
                <p>{DISCLAIMER}</p>
              </div>
              <p className="warning">
                Early buyers can sell above what late buyers paid. Late buyers
                lose at least 7.5% if they sell. Never send OG directly to the
                contract: it is stuck forever.
              </p>
            </>
          ) : modal === "founder" ? (
            <p className="warning">
              You lose membership and can never claim again. The fixed 100,000
              OG payout comes from the funded founder reserve.
            </p>
          ) : (
            <>
              <p>
                Your pass is burned and you lose membership. You receive{" "}
                {og(reviewQuote)} OG (92.5%).
              </p>
              <p>
                Burned:{" "}
                {og(
                  reviewQuote !== undefined
                    ? (reviewQuote * 750n) / 9250n
                    : undefined,
                )}{" "}
                OG (7.5%). Your minimum payout is protected for 10 minutes. A
                falling quote requires a new review.
              </p>
            </>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            {modal === "buy"
              ? "I have read the disclaimer and understand the membership risks."
              : "I understand that selling burns my pass and ends my membership."}
          </label>
          <button
            className={`button ${modal === "buy" ? "primary" : "danger"}`}
            disabled={
              !accepted ||
              busy ||
              !ready ||
              !mainnetReady ||
              !connectedMember ||
              (modal === "buy" && !canBuy)
            }
            onClick={() =>
              void run(async () => {
                const p = port();
                if (modal === "buy") await buyPass(p, reviewQuote!);
                else if (modal === "founder")
                  await sellFounderPass(p, connectedMember!.tokenId!);
                else await sellPass(p, connectedMember!.tokenId!, reviewQuote!);
              })
            }
          >
            {busy
              ? "Transaction in progress…"
              : modal === "buy"
                ? "Approve exact OG & buy"
                : modal === "founder"
                  ? "Sell founder pass permanently"
                  : "Sell pass & end membership"}
          </button>
          <p className="caption">
            Account: {wallet.address && shortAddress(wallet.address)} · Ethereum
            mainnet. Network fees are paid in ETH.
          </p>
          {notices}
        </Modal>
      )}
    </>
  );
}
