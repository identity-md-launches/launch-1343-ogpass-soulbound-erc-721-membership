import fs from "node:fs";
import { createServer } from "vite";
import assert from "node:assert/strict";
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { Club, makeClient } = await server.ssrLoadModule("/src/chain.ts");
  const { founderTree, founders } =
    await server.ssrLoadModule("/src/founders.ts");
  const dep = JSON.parse(fs.readFileSync("public/imd-deployment.json", "utf8"));
  const club = new Club(dep, makeClient(["http://127.0.0.1:42601/rpc/1"]));
  await club.verify();
  const s = await club.snapshot();
  const [prices, history] = await Promise.all([
    club.prices(s),
    club.history(s.block),
  ]);
  assert.equal(prices.length, Number(s.publicSupply) + 100);
  assert.equal(prices[0], 1000000n * 10n ** 18n);
  assert.equal(founders.length, 49);
  const rootMatches =
    founderTree.root.toLowerCase() === s.founderRoot.toLowerCase();
  const member = history.events.length
    ? await club.member(
        history.events[0].args.buyer || history.events[0].args.seller,
        s.block,
      )
    : undefined;
  const result = {
    member,
    checkedAt: new Date().toISOString(),
    chainId: 1,
    verification: club.verified,
    computedFounderRoot: founderTree.root,
    rootMatches,
    snapshot: s,
    chartPoints: prices.length,
    firstPrice: prices[0],
    lastPrice: prices.at(-1),
    history,
  };
  fs.writeFileSync(
    "../artifacts/live-check.json",
    JSON.stringify(
      result,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      result,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
} finally {
  await server.close();
}
