// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {OGPass} from "../src/OGPass.sol";
import {MockOG} from "./mocks/MockOG.sol";
import {Merkle} from "./helpers/Merkle.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

/// @notice A hostile handler. Besides the happy actions it keeps trying what must fail (transfers, stranger
///         claims, double buys, founder passes into the curve, owner withdrawals, expired and badly priced
///         orders) and asserts the exact revert, so every failure path is exercised under random state.
///         It also pushes stray OG into the contract and records every token id ever minted.
contract HostileHandler is Test {
    uint256 public constant ACTORS = 20;
    uint256 public constant FOUNDER_BUYBACK = 100_000e18;
    uint256 public constant SELL_BPS = 9250;
    uint256 public constant BPS = 10_000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    OGPass public pass;
    MockOG public og;
    address public owner;
    address[] public founders;
    bytes32[] public leaves;

    mapping(address => uint256) public tokenOf;
    uint256 public mintedIds; // token ids are 1..mintedIds
    uint256 public ghostDeposited; // through buy and fundFounderReserve
    uint256 public ghostDonated; // pushed in directly, outside any reserve
    uint256 public ghostPaidToSellers;
    uint256 public ghostPaidToFounders;
    uint256 public ghostBurned;
    uint256 public ghostClaimsAfterDeadline;
    uint256 public ghostFailedAttempts;
    bool public ghostCrossedDeadline;
    uint256 public founderClaimedAtDeadline;

    constructor(OGPass pass_, MockOG og_, address owner_, address[] memory founders_, bytes32[] memory leaves_) {
        pass = pass_;
        og = og_;
        owner = owner_;
        founders = founders_;
        leaves = leaves_;
    }

    function actor(uint256 i) public pure returns (address) {
        return address(uint160(0xB000 + (i % ACTORS)));
    }

    function _capReached() internal view returns (bool) {
        return pass.publicSupply() + pass.founderOutstanding() + pass.reservedFounderSlots() >= pass.MAX_SUPPLY();
    }

    function _fund(address who, uint256 amount) internal {
        og.mint(who, amount);
        vm.prank(who);
        og.approve(address(pass), amount);
    }

    // --- happy actions, with the exact failure asserted when the precondition is not met --------------

    function buy(uint256 a) external {
        address who = actor(a);
        uint256 price = pass.currentBuyPrice();
        _fund(who, price);
        if (pass.buysPaused()) {
            vm.prank(who);
            vm.expectRevert(OGPass.BuysPaused.selector);
            pass.buy(price, block.timestamp);
            ghostFailedAttempts++;
            return;
        }
        if (pass.isMember(who)) {
            vm.prank(who);
            vm.expectRevert(OGPass.AlreadyMember.selector);
            pass.buy(price, block.timestamp);
            ghostFailedAttempts++;
            return;
        }
        if (_capReached()) {
            vm.prank(who);
            vm.expectRevert(OGPass.SupplyCapReached.selector);
            pass.buy(price, block.timestamp);
            ghostFailedAttempts++;
            return;
        }
        uint256 balBefore = og.balanceOf(who);
        vm.prank(who);
        uint256 id = pass.buy(price, block.timestamp);
        assertEq(balBefore - og.balanceOf(who), price, "buy pulled a different amount");
        assertEq(pass.ownerOf(id), who);
        assertFalse(pass.isFounder(id));
        tokenOf[who] = id;
        mintedIds++;
        assertEq(id, mintedIds, "token ids must be sequential");
        ghostDeposited += price;
    }

    function sell(uint256 a) external {
        address who = actor(a);
        uint256 id = tokenOf[who];
        if (id == 0) return;
        uint256 price = pass.priceOf(pass.publicSupply());
        uint256 payout = (price * SELL_BPS) / BPS;
        assertEq(pass.currentSellPrice(), payout, "quote drift");
        uint256 deadBefore = og.balanceOf(DEAD);
        uint256 balBefore = og.balanceOf(who);
        vm.prank(who);
        uint256 got = pass.sell(id, payout, block.timestamp);
        assertEq(got, payout);
        assertEq(og.balanceOf(who) - balBefore, payout, "seller paid wrong amount");
        assertEq(og.balanceOf(DEAD) - deadBefore, price - payout, "burn share wrong");
        tokenOf[who] = 0;
        ghostPaidToSellers += got;
        ghostBurned += price - got;
    }

    function claim(uint256 f) external {
        f %= founders.length;
        address who = founders[f];
        bytes32[] memory proof = Merkle.proof(leaves, f);
        if (block.timestamp >= pass.claimDeadline()) {
            vm.prank(who);
            vm.expectRevert(OGPass.ClaimClosed.selector);
            pass.claimFounder(proof);
            ghostClaimsAfterDeadline++;
            return;
        }
        if (pass.hasClaimedFounder(who)) {
            vm.prank(who);
            vm.expectRevert(OGPass.AlreadyClaimed.selector);
            pass.claimFounder(proof);
            ghostFailedAttempts++;
            return;
        }
        if (pass.isMember(who)) return; // a founder holding a public pass: covered by founderBuysPublic
        vm.prank(who);
        uint256 id = pass.claimFounder(proof);
        assertTrue(pass.isFounder(id));
        tokenOf[who] = id;
        mintedIds++;
        assertEq(id, mintedIds, "token ids must be sequential");
    }

    function sellFounder(uint256 f) external {
        f %= founders.length;
        address who = founders[f];
        uint256 id = tokenOf[who];
        if (id == 0 || !pass.isFounder(id)) return;
        uint256 reserve = pass.founderReserve();
        if (reserve < FOUNDER_BUYBACK) {
            vm.prank(who);
            vm.expectRevert(
                abi.encodeWithSelector(OGPass.InsufficientFounderReserve.selector, reserve, FOUNDER_BUYBACK)
            );
            pass.sellFounder(id);
            ghostFailedAttempts++;
            return;
        }
        uint256 balBefore = og.balanceOf(who);
        vm.prank(who);
        pass.sellFounder(id);
        assertEq(og.balanceOf(who) - balBefore, FOUNDER_BUYBACK, "founder paid wrong amount");
        assertFalse(pass.isFounder(id));
        tokenOf[who] = 0;
        ghostPaidToFounders += FOUNDER_BUYBACK;
    }

    function fundReserve(uint256 amount) external {
        amount = bound(amount, 1, 400_000e18);
        address who = address(0xF00D);
        _fund(who, amount);
        vm.prank(who);
        pass.fundFounderReserve(amount);
        ghostDeposited += amount;
    }

    function donate(uint256 amount) external {
        // OG pushed in outside buy/fund: must never be counted by any reserve nor change any payout.
        amount = bound(amount, 1, 1_000e18);
        og.mint(address(pass), amount);
        ghostDonated += amount;
    }

    function burnUnclaimed() external {
        uint256 needed = pass.founderOutstanding() * FOUNDER_BUYBACK;
        uint256 reserve = pass.founderReserve();
        if (block.timestamp < pass.claimDeadline()) {
            vm.expectRevert(OGPass.ClaimStillOpen.selector);
            pass.burnUnclaimedFounderReserve();
            return;
        }
        if (reserve <= needed) {
            vm.expectRevert(OGPass.NothingToBurn.selector);
            pass.burnUnclaimedFounderReserve();
            return;
        }
        uint256 deadBefore = og.balanceOf(DEAD);
        uint256 burned = pass.burnUnclaimedFounderReserve();
        assertEq(burned, reserve - needed);
        assertEq(pass.founderReserve(), needed);
        assertEq(og.balanceOf(DEAD) - deadBefore, burned);
        ghostBurned += burned;
    }

    function warp(uint256 delta) external {
        delta = bound(delta, 1 hours, 4 days);
        vm.warp(block.timestamp + delta);
        if (!ghostCrossedDeadline && block.timestamp >= pass.claimDeadline()) {
            ghostCrossedDeadline = true;
            founderClaimedAtDeadline = pass.founderClaimed();
        }
    }

    function togglePause() external {
        bool next = !pass.buysPaused();
        vm.prank(owner);
        pass.setBuysPaused(next);
        assertEq(pass.buysPaused(), next);
    }

    // --- actions that must always fail -----------------------------------------------------------------

    function attemptTransfer(uint256 a, uint256 b) external {
        address from = actor(a);
        address to = actor((b % ACTORS) + 1);
        uint256 id = tokenOf[from];
        if (id == 0) {
            // try a founder's pass instead, if any is held
            from = founders[a % founders.length];
            id = tokenOf[from];
            if (id == 0) return;
        }
        vm.startPrank(from);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.transferFrom(from, to, id);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.safeTransferFrom(from, to, id);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.approve(to, id);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.setApprovalForAll(to, true);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(0)));
        pass.transferFrom(from, address(0), id);
        vm.stopPrank();
        vm.prank(to);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.transferFrom(from, to, id);
        assertEq(pass.ownerOf(id), from);
        ghostFailedAttempts++;
    }

    function attemptStrangerClaim(uint256 a, uint256 f) external {
        address stranger = actor(a);
        f %= founders.length;
        bytes32[] memory proof = Merkle.proof(leaves, f);
        bytes4 expected;
        if (block.timestamp >= pass.claimDeadline()) {
            expected = OGPass.ClaimClosed.selector;
        } else if (pass.founderClaimed() >= founders.length) {
            expected = OGPass.FounderCapReached.selector;
        } else if (pass.isMember(stranger)) {
            expected = OGPass.AlreadyMember.selector;
        } else {
            expected = OGPass.InvalidProof.selector;
        }
        vm.prank(stranger);
        vm.expectRevert(expected);
        pass.claimFounder(proof);
        assertFalse(pass.hasClaimedFounder(stranger));
        ghostFailedAttempts++;
    }

    function attemptFounderIntoCurve(uint256 f, uint256 a) external {
        f %= founders.length;
        address who = founders[f];
        uint256 id = tokenOf[who];
        if (id != 0 && pass.isFounder(id)) {
            vm.prank(who);
            vm.expectRevert(OGPass.NotPublicPass.selector);
            pass.sell(id, 0, block.timestamp);
            ghostFailedAttempts++;
        }
        address holder = actor(a);
        uint256 pid = tokenOf[holder];
        if (pid != 0) {
            vm.prank(holder);
            vm.expectRevert(OGPass.NotFounderPass.selector);
            pass.sellFounder(pid);
            ghostFailedAttempts++;
        }
    }

    function attemptBadOrders(uint256 a) external {
        address who = actor(a);
        uint256 id = tokenOf[who];
        if (id != 0) {
            uint256 payout = pass.currentSellPrice();
            vm.prank(who);
            vm.expectRevert(abi.encodeWithSelector(OGPass.PayoutBelowMin.selector, payout, payout + 1));
            pass.sell(id, payout + 1, block.timestamp);
            vm.prank(who);
            vm.expectRevert(OGPass.Expired.selector);
            pass.sell(id, 0, block.timestamp - 1);
            // someone else cannot sell it
            vm.prank(actor((a % ACTORS) + 1));
            vm.expectRevert(OGPass.NotTokenOwner.selector);
            pass.sell(id, 0, block.timestamp);
        } else {
            uint256 price = pass.currentBuyPrice();
            _fund(who, price);
            vm.prank(who);
            vm.expectRevert(OGPass.Expired.selector);
            pass.buy(price, block.timestamp - 1);
            if (!pass.buysPaused() && !_capReached()) {
                vm.prank(who);
                vm.expectRevert(abi.encodeWithSelector(OGPass.PriceAboveMax.selector, price, price - 1));
                pass.buy(price - 1, block.timestamp);
            }
        }
        ghostFailedAttempts++;
    }

    function attemptOwnerAbuse(uint256 a) external {
        address stranger = actor(a);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        pass.setBuysPaused(true);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        pass.setBaseURI("x");
        uint256 before = og.balanceOf(address(pass));
        vm.prank(owner);
        (bool ok,) = address(pass).call(abi.encodeWithSignature("withdraw(uint256)", before));
        assertFalse(ok);
        vm.prank(owner);
        (ok,) = address(pass).call(abi.encodeWithSignature("rescueERC20(address,uint256)", address(og), before));
        assertFalse(ok);
        assertEq(og.balanceOf(address(pass)), before);
        assertEq(og.balanceOf(owner), 0);
        ghostFailedAttempts++;
    }

    function founderBuysPublic(uint256 f) external {
        // A founder who has not claimed may buy a public pass; then claiming must fail with AlreadyMember.
        f %= founders.length;
        address who = founders[f];
        if (pass.isMember(who) || pass.buysPaused() || _capReached()) return;
        uint256 price = pass.currentBuyPrice();
        _fund(who, price);
        vm.prank(who);
        uint256 id = pass.buy(price, block.timestamp);
        tokenOf[who] = id;
        mintedIds++;
        ghostDeposited += price;
        if (block.timestamp < pass.claimDeadline() && !pass.hasClaimedFounder(who)) {
            vm.prank(who);
            vm.expectRevert(OGPass.AlreadyMember.selector);
            pass.claimFounder(Merkle.proof(leaves, f));
            ghostFailedAttempts++;
        }
    }

    function founderSellsPublic(uint256 f) external {
        f %= founders.length;
        address who = founders[f];
        uint256 id = tokenOf[who];
        if (id == 0 || pass.isFounder(id)) return;
        uint256 price = pass.priceOf(pass.publicSupply());
        uint256 payout = (price * SELL_BPS) / BPS;
        vm.prank(who);
        uint256 got = pass.sell(id, payout, block.timestamp);
        tokenOf[who] = 0;
        ghostPaidToSellers += got;
        ghostBurned += price - got;
    }
}

/// forge-config: default.invariant.runs = 96
/// forge-config: default.invariant.depth = 80
/// forge-config: default.invariant.fail-on-revert = true
contract OGPassHostileInvariantTest is StdInvariant, Test {
    uint256 internal constant FOUNDER_COUNT = 49;
    uint256 internal constant BASE_PRICE = 1_000_000e18;
    uint256 internal constant PRICE_STEP = 10_000e18;
    uint256 internal constant FOUNDER_BUYBACK = 100_000e18;

    MockOG internal og;
    OGPass internal pass;
    HostileHandler internal handler;
    address internal owner = makeAddr("owner");
    address[] internal founders;

    function setUp() public {
        vm.warp(1_760_000_000);
        og = new MockOG();
        for (uint256 i; i < FOUNDER_COUNT; ++i) {
            founders.push(makeAddr(string.concat("founder", vm.toString(i))));
        }
        bytes32[] memory leaves = Merkle.leavesOf(founders);
        pass = new OGPass(address(og), Merkle.root(leaves), FOUNDER_COUNT, owner);
        handler = new HostileHandler(pass, og, owner, founders, leaves);

        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](16);
        selectors[0] = handler.buy.selector;
        selectors[1] = handler.buy.selector; // weight buys and sells a little higher
        selectors[2] = handler.sell.selector;
        selectors[3] = handler.sell.selector;
        selectors[4] = handler.claim.selector;
        selectors[5] = handler.sellFounder.selector;
        selectors[6] = handler.fundReserve.selector;
        selectors[7] = handler.donate.selector;
        selectors[8] = handler.burnUnclaimed.selector;
        selectors[9] = handler.warp.selector;
        selectors[10] = handler.togglePause.selector;
        selectors[11] = handler.attemptTransfer.selector;
        selectors[12] = handler.attemptStrangerClaim.selector;
        selectors[13] = handler.attemptFounderIntoCurve.selector;
        selectors[14] = handler.attemptBadOrders.selector;
        selectors[15] = handler.attemptOwnerAbuse.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        bytes4[] memory more = new bytes4[](2);
        more[0] = handler.founderBuysPublic.selector;
        more[1] = handler.founderSellsPublic.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: more}));
    }

    function sumPrices(uint256 n) internal pure returns (uint256) {
        return n * BASE_PRICE + (PRICE_STEP * n * (n > 0 ? n - 1 : 0)) / 2;
    }

    // --- conservation ------------------------------------------------------------------------------

    function invariant_curveReserveIsSumOfOutstandingPrices() public view {
        assertEq(pass.curveReserve(), sumPrices(pass.publicSupply()));
    }

    function invariant_balanceCoversReservesPlusStrayDonations() public view {
        // Donations sit on top of the two reserves and are never absorbed into either.
        assertEq(og.balanceOf(address(pass)), pass.curveReserve() + pass.founderReserve() + handler.ghostDonated());
    }

    function invariant_everyWeiAccountedFor() public view {
        assertEq(
            handler.ghostDeposited() + handler.ghostDonated(),
            og.balanceOf(address(pass)) + handler.ghostPaidToSellers() + handler.ghostPaidToFounders()
                + handler.ghostBurned()
        );
        assertEq(og.balanceOf(handler.DEAD()), handler.ghostBurned());
        assertEq(og.balanceOf(owner), 0);
    }

    // --- structure -----------------------------------------------------------------------------------

    function invariant_tokenRegistryMatchesCounters() public view {
        uint256 founderTokens;
        uint256 publicTokens;
        uint256 n = handler.mintedIds();
        for (uint256 id = 1; id <= n; ++id) {
            (bool exists, address holder) = _owner(id);
            if (!exists) {
                assertFalse(pass.isFounder(id), "burned token still flagged founder");
                continue;
            }
            assertEq(pass.balanceOf(holder), 1);
            if (pass.isFounder(id)) {
                founderTokens++;
                assertTrue(pass.hasClaimedFounder(holder), "founder pass held by non-claimant");
            } else {
                publicTokens++;
            }
        }
        // Nothing beyond the last minted id exists.
        (bool extra,) = _owner(n + 1);
        assertFalse(extra);
        assertEq(founderTokens, pass.founderOutstanding(), "founderOutstanding != founder tokens");
        assertEq(publicTokens, pass.publicSupply(), "publicSupply != public tokens");
        assertEq(pass.totalSupply(), founderTokens + publicTokens);
    }

    function invariant_capAndFounderCounters() public view {
        assertLe(pass.totalSupply(), pass.MAX_SUPPLY());
        assertLe(pass.totalSupply() + pass.reservedFounderSlots(), pass.MAX_SUPPLY());
        assertLe(pass.founderOutstanding(), pass.founderClaimed());
        assertLe(pass.founderClaimed(), FOUNDER_COUNT);
        if (block.timestamp >= pass.claimDeadline()) {
            assertEq(pass.reservedFounderSlots(), 0);
        } else {
            assertEq(pass.reservedFounderSlots(), FOUNDER_COUNT - pass.founderClaimed());
        }
    }

    function invariant_claimsFrozenAfterDeadline() public view {
        if (handler.ghostCrossedDeadline()) {
            assertEq(pass.founderClaimed(), handler.founderClaimedAtDeadline(), "claim landed after deadline");
        }
    }

    function invariant_onePassPerWallet() public view {
        for (uint256 i; i < handler.ACTORS(); ++i) {
            address a = handler.actor(i);
            uint256 id = handler.tokenOf(a);
            assertLe(pass.balanceOf(a), 1);
            assertEq(pass.isMember(a), id != 0);
            if (id != 0) assertEq(pass.ownerOf(id), a);
        }
        for (uint256 i; i < FOUNDER_COUNT; ++i) {
            address f = founders[i];
            uint256 id = handler.tokenOf(f);
            assertLe(pass.balanceOf(f), 1);
            assertEq(pass.isMember(f), id != 0);
            if (id != 0) assertEq(pass.ownerOf(id), f);
        }
    }

    function invariant_curveNeverSpendsFounderReserve() public view {
        // Both reserves are fully backed on their own: neither one can be paying out of the other.
        assertLe(pass.curveReserve(), og.balanceOf(address(pass)));
        assertLe(pass.founderReserve(), og.balanceOf(address(pass)) - pass.curveReserve());
    }

    function invariant_quotesConsistent() public view {
        assertEq(pass.currentBuyPrice(), BASE_PRICE + PRICE_STEP * pass.publicSupply());
        if (pass.publicSupply() == 0) {
            assertEq(pass.currentSellPrice(), 0);
        } else {
            assertEq(pass.currentSellPrice(), ((BASE_PRICE + PRICE_STEP * (pass.publicSupply() - 1)) * 9250) / 10_000);
            assertLt(pass.currentSellPrice(), pass.currentBuyPrice());
        }
    }

    // --- liveness: after any sequence everyone can leave and the curve drains to exactly zero ----------

    function afterInvariant() public {
        // Sell every public pass, in actor order, whatever the history was.
        uint256 paid;
        uint256 burned;
        for (uint256 i; i < handler.ACTORS() + FOUNDER_COUNT; ++i) {
            address who = i < handler.ACTORS() ? handler.actor(i) : founders[i - handler.ACTORS()];
            uint256 id = handler.tokenOf(who);
            if (id == 0 || pass.isFounder(id)) continue;
            uint256 price = pass.priceOf(pass.publicSupply());
            vm.prank(who);
            uint256 got = pass.sell(id, 0, block.timestamp);
            assertEq(got, (price * 9250) / 10_000);
            paid += got;
            burned += price - got;
            assertEq(pass.curveReserve(), sumPrices(pass.publicSupply()));
        }
        assertEq(pass.publicSupply(), 0, "public passes left");
        assertEq(pass.curveReserve(), 0, "curve reserve not drained");

        // Fund exactly what the remaining founders need and let all of them out.
        uint256 outstanding = pass.founderOutstanding();
        uint256 need = outstanding * FOUNDER_BUYBACK;
        if (need > pass.founderReserve()) {
            uint256 top = need - pass.founderReserve();
            og.mint(address(this), top);
            og.approve(address(pass), top);
            pass.fundFounderReserve(top);
        }
        for (uint256 i; i < FOUNDER_COUNT; ++i) {
            uint256 id = handler.tokenOf(founders[i]);
            if (id == 0 || !pass.isFounder(id)) continue;
            vm.prank(founders[i]);
            pass.sellFounder(id);
        }
        assertEq(pass.founderOutstanding(), 0, "founders left");
        assertEq(pass.totalSupply(), 0);

        // Whatever is left in the founder reserve is pure excess; after the deadline it all burns.
        vm.warp(pass.claimDeadline());
        if (pass.founderReserve() > 0) {
            pass.burnUnclaimedFounderReserve();
        }
        assertEq(pass.founderReserve(), 0);
        // Only the stray donations remain, exactly.
        assertEq(og.balanceOf(address(pass)), handler.ghostDonated(), "balance after full unwind");
        // The curve restarts from the base price for the next buyer.
        assertEq(pass.currentBuyPrice(), BASE_PRICE);
        assertEq(pass.currentSellPrice(), 0);
    }

    function _owner(uint256 id) internal view returns (bool exists, address holder) {
        try pass.ownerOf(id) returns (address o) {
            return (true, o);
        } catch {
            return (false, address(0));
        }
    }
}
