# OG Pass

Soulbound ERC-721 membership pass on Ethereum mainnet, paid for in the existing OG ERC-20.
One Solidity contract, `OGPass` (`src/OGPass.sol`), no proxy, no upgrade path, no launch token.

| Item | Value |
| --- | --- |
| NFT name / symbol | `OG Pass` / `OGPASS` |
| Payment token | OG, `0xCe7EB1Ad9e2E1c784ea05F7eA4A0Fe625923D10A` (18 decimals, no transfer fee) |
| Burn address | `0x000000000000000000000000000000000000dEaD` |
| Supply cap | 1,000 passes outstanding (49 founder slots + up to 951 public) |
| Founder claim window | 30 days from deployment, immutable |
| Founder buyback | exactly 100,000 OG per pass, from a separate founder reserve |
| Public price | `P(n) = 1,000,000 OG + 10,000 OG × (n − 1)` for the n-th outstanding public pass |
| Sell payout | 92.5 % of `P(publicSupply)` to the seller, 7.5 % to the burn address |

## Behaviour

### Soulbound

Every `transferFrom`, both `safeTransferFrom` overloads, `approve` and `setApprovalForAll` revert with
`Soulbound()`. Minting and burning are the only state changes to ownership. A wallet can hold at most one
pass of any kind; a wallet that burns its pass may acquire another.

### Founder passes

* `claimFounder(bytes32[] proof)` mints one pass to `msg.sender` if the proof matches `founderRoot` for the
  OpenZeppelin standard leaf `keccak256(bytes.concat(keccak256(abi.encode(msg.sender))))`, the caller has not
  claimed before, the caller holds no pass, fewer than `founderCount` claims have happened, and
  `block.timestamp < claimDeadline`. Claims cannot be paused.
* Founder passes are off-curve: `sell` refuses them with `NotPublicPass()`, and they never touch `curveReserve`.
* `sellFounder(tokenId)` burns the caller's founder pass and pays exactly `FOUNDER_BUYBACK` from
  `founderReserve`. It reverts with `InsufficientFounderReserve` if the reserve cannot cover it. It works at any
  time, paused or not, before or after the deadline. A founder who sold cannot claim again.
* `fundFounderReserve(amount)` lets anyone deposit OG into the founder reserve. The amount actually received is
  verified by balance difference.
* `burnUnclaimedFounderReserve()` is callable by anyone once `block.timestamp >= claimDeadline`. It sends
  `founderReserve − founderOutstanding × 100,000 OG` to the burn address and keeps exactly what the still-held
  founder passes need. It reverts with `NothingToBurn()` when there is no excess, and can be called again
  whenever new excess appears (for example after a later deposit).

### Public bonding curve

* `buy(maxPrice, deadline)` mints one public pass for exactly `P(publicSupply + 1)`, pulled with
  `transferFrom` and verified by balance difference. It reverts if the price exceeds `maxPrice`, if
  `block.timestamp > deadline`, if buys are paused, if the caller already holds a pass, or if the cap is reached.
* `sell(tokenId, minOut, deadline)` burns the caller's public pass, pays `P(publicSupply) × 9250 / 10000` to the
  seller and the remaining 7.5 % to the burn address. It reverts if the payout is below `minOut` or past the
  deadline. The payout depends on the current supply, not on what the seller originally paid.
* `curveReserve` always equals `Σ P(i)` for `i = 1..publicSupply`. Each sell removes `P(publicSupply)`, so
  selling every public pass in any order leaves the reserve at exactly zero. All prices are multiples of
  10,000 OG, so the 92.5 / 7.5 split is exact and no rounding dust exists.

### Supply cap

`MAX_SUPPLY = 1000`. Before the claim deadline, the unclaimed founder slots (`founderCount − founderClaimed`)
are reserved inside the cap, so the public can mint at most 951 passes while founders can always claim. From
the deadline on, unclaimed founder slots open to the public. Any burned pass, public or founder, frees one
slot. `buy()` reverts with `SupplyCapReached()` when
`publicSupply + founderOutstanding + reservedFounderSlots() >= 1000`.

### Owner powers (and nothing else)

* `setBaseURI(string)` sets the metadata prefix. `tokenURI(id)` is `baseURI + id`.
* `setBuysPaused(bool)` pauses or resumes **new public buys only**. Sells, claims, founder buybacks, reserve
  funding and reserve burning can never be paused.
* Ownership is two-step (`transferOwnership` then `acceptOwnership` by the new owner) via OpenZeppelin
  `Ownable2Step`; the owner may also `renounceOwnership`.

The owner cannot withdraw OG, change any price, the Merkle root, the founder count or the deadline, mint
passes, or upgrade the contract. There is no withdrawal function at all: OG sent directly to the contract
outside `buy` / `fundFounderReserve` is unrecoverable.

### Views

`currentBuyPrice()`, `currentSellPrice()`, `publicSupply()`, `founderClaimed()`, `founderOutstanding()`,
`curveReserve()`, `founderReserve()`, `isMember(address)`, `isFounder(tokenId)`, `totalSupply()`,
`reservedFounderSlots()`, `priceOf(n)`, `hasClaimedFounder(address)`, `claimDeadline()`, `buysPaused()`.

### Events

`Claim`, `Buy`, `Sell`, `FounderSell`, `ReserveFunded`, `ReserveBurned`, `BuyPause`, `BaseURIUpdated`, plus the
standard ERC-721 and Ownable events.

## Security notes

* `ReentrancyGuard` on every state-changing external function, checks-effects-interactions throughout, and
  `_mint` (not `_safeMint`) so no receiver hook runs during a mint.
* Every OG deposit is measured by balance difference and must equal the requested amount
  (`AmountMismatch`). A fee-on-transfer or rebasing token would be rejected, not mis-accounted.
* `SafeERC20` for all token calls; custom errors everywhere.
* The constructor never calls the OG token, so it deploys on an empty chain (the launch rehearsal) and the token
  is only checked on first use.
* Runtime bytecode is about 10 KB, well under EIP-170, and contains no `DELEGATECALL`, `CALLCODE` or
  `SELFDESTRUCT`.
* Slither and Mythril were not available in this environment and did not run. Tests and fuzzing passed; this
  is not an audit. An independent adversarial review is required before funds are committed.

## Deployment parameters (Ethereum mainnet, chain id 1)

Constructor: `OGPass(address og, bytes32 founderRoot, uint256 founderCount, address owner)`

| Argument | Value |
| --- | --- |
| `og` | `0xCe7EB1Ad9e2E1c784ea05F7eA4A0Fe625923D10A` |
| `founderRoot` | `0xb9c8ed1655d96a99d756f50819afd0c008b1097497edba9ee4fdb1b7ce2dc6c8` |
| `founderCount` | `49` |
| `owner` | `$owner` = `0x5b95A971B4583A5f011E9DA082acdD679b870D06` |

`claimDeadline` is fixed at deployment as `block.timestamp + 30 days`. Everything else is a constant in the
contract. `script/DeployOGPass.s.sol` holds the same values in one place and exposes `deploy(Config)` for
tests; the launch itself deploys from the built bytecode with the arguments above. No `launch.json` is
written here; the manifest step produces it.

The OG token address was read on 2026-10-11 from a public mainnet RPC and reported `symbol() = "OG"` and
`decimals() = 18`. The "no transfer fee" property is taken from the brief; the contract would reject a fee
on every deposit anyway.

## Assumptions

* The 49 founder addresses were hashed by the requester into `founderRoot` with the OpenZeppelin standard
  Merkle tree encoding (`StandardMerkleTree` of `["address"]`, sorted-pair hashing). Proofs from that tool
  verify directly. Only the root is known here; the tests build their own trees to exercise the logic.
* `founderCount = 49` is used as the number of reserved slots and the maximum number of claims. If the tree has
  more leaves than 49, the 50th valid claim reverts with `FounderCapReached()`.
* Founders who claim after the public has filled 951 slots still get their pass: their slots are reserved
  until the deadline.
* Founder buybacks depend entirely on someone funding the founder reserve. If nobody does, `sellFounder`
  reverts and founder passes simply remain held. The brief calls this buyback "optional".
* The boundary is consistent: at `claimDeadline` itself claims are closed and the reserve burn is open.
* OG sent to the contract by plain `transfer` (not through `buy` or `fundFounderReserve`) is not counted in any
  reserve and cannot be recovered by anyone.

## Operational responsibilities

After launch:

1. **Set the base URI** (optional, owner only): `setBaseURI("https://.../")`. No metadata is served until then.
2. **Fund the founder reserve** if buybacks are intended: approve the pass for the amount, then
   `fundFounderReserve(amount)`. Anyone can do it; 100,000 OG per founder expected to redeem. Deposits made
   after the claim deadline beyond what held founders need can be burned by anyone.
3. **Distribute Merkle proofs** to the 49 founders. Each founder calls `claimFounder(proof)` from the
   allowlisted wallet before `claimDeadline()` (30 days after deployment). Missed claims are forfeited.
4. **After the deadline**, anyone may call `burnUnclaimedFounderReserve()` to send excess reserve to the burn
   address. This is permissionless by design; the owner has no special role here.
5. **Pause switch**: `setBuysPaused(true/false)` only affects new buys. Use it for emergencies on the buy side;
   it cannot stop anyone from exiting.
6. **Ownership**: keep the owner key in a multisig if possible. The owner's only powers are the URI and the buy
   pause, so a compromised key cannot touch funds.
7. **Verification**: verify the source on the block explorer after deployment (`forge verify-contract` with
   the constructor arguments above and `bytecode_hash = "none"`).

## Repository layout

```
foundry.toml, remappings.txt      Foundry configuration (solc 0.8.26, bytecode_hash = "none")
src/OGPass.sol                    the contract
script/DeployOGPass.s.sol         deployment parameters and deploy(Config)
test/OGPass.t.sol                 unit tests (67)
test/OGPassFuzz.t.sol             fuzz / property tests (8)
test/OGPass.invariant.t.sol       stateful invariant tests with a handler (6 invariants)
test/DeployOGPass.t.sol           deployment configuration tests (3)
test/OGPassBase.sol               shared fixture
test/helpers/Merkle.sol           OpenZeppelin-compatible Merkle tree builder for tests
test/mocks/MockOG.sol             mock OG and a fee-on-transfer token
lib/openzeppelin-contracts        vendored OpenZeppelin Contracts v5.0.2 (see PROVENANCE.md)
lib/forge-std                     vendored forge-std v1.9.6 (see PROVENANCE.md)
```

## Build and test

```
forge build
forge test
forge fmt --check
```

Tests do not read or set environment variables and run in any order and in parallel.
