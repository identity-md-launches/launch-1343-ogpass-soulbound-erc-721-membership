import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { keccak256, toBytes, createPublicClient, http } from "viem";
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])]),
        )
      : value;
const abi = JSON.parse(
  execFileSync("forge", ["inspect", "OGPass", "abi", "--json"], {
    cwd: "..",
    encoding: "utf8",
  }),
);
const output = new URL("../public/imd-deployment.json", import.meta.url);
const input = process.argv.includes("--generate")
  ? JSON.parse(fs.readFileSync("../.imd/reads/deployment.json", "utf8"))
  : JSON.parse(fs.readFileSync(output, "utf8"));
const contract = input.contracts.find((c) => c.name === "OGPass");
const hash = keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);
assert.equal(hash, contract.abiHash, "Source ABI differs from pinned abiHash");
if (process.argv.includes("--generate")) {
  const client = createPublicClient({
    transport: http("http://127.0.0.1:42601/rpc/1"),
  });
  assert.equal(await client.getChainId(), input.chainId);
  const code = await client.getCode({ address: contract.address });
  assert.ok(code && code !== "0x", "No deployed runtime code");
  contract.abi = abi;
  contract.runtimeCodeHash = keccak256(code);
  const network = JSON.parse(
    fs.readFileSync("../.imd/reads/network.json", "utf8"),
  );
  input.poolManager = network.network.uniswapV4.poolManager;
  fs.writeFileSync(output, JSON.stringify(input, null, 2) + "\n");
} else {
  assert.deepEqual(contract.abi, abi);
}
console.log(
  JSON.stringify(
    {
      abiHash: hash,
      sourceCommit: input.sourceCommit,
      runtimeCodeHash: contract.runtimeCodeHash,
      entries: abi.length,
    },
    null,
    2,
  ),
);
