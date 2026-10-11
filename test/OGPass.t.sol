// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OGPassBase} from "./OGPassBase.sol";
import {OGPass} from "../src/OGPass.sol";
import {MockOG, FeeOnTransferOG} from "./mocks/MockOG.sol";
import {Merkle} from "./helpers/Merkle.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC-20 whose transfers re-enter the pass, to show the guard holds even for a hostile token.
contract ReentrantOG is ERC20 {
    OGPass public pass;
    uint256 public tokenId;
    bool public armed;

    constructor() ERC20("Reentrant", "ROG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(OGPass pass_, uint256 tokenId_) external {
        pass = pass_;
        tokenId = tokenId_;
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && from == address(pass)) {
            armed = false;
            pass.sell(tokenId, 0, block.timestamp);
        }
    }
}

contract OGPassTest is OGPassBase {
    // =============================================================================================
    // Deployment
    // =============================================================================================

    function test_metadataAndImmutables() public view {
        assertEq(pass.name(), "OG Pass");
        assertEq(pass.symbol(), "OGPASS");
        assertEq(address(pass.OG()), address(og));
        assertEq(pass.founderRoot(), root);
        assertEq(pass.founderCount(), FOUNDER_COUNT);
        assertEq(pass.claimDeadline(), deployTime + 30 days);
        assertEq(pass.owner(), owner);
        assertEq(pass.MAX_SUPPLY(), MAX_SUPPLY);
        assertEq(pass.BURN_ADDRESS(), DEAD);
        assertEq(pass.publicSupply(), 0);
        assertEq(pass.founderClaimed(), 0);
        assertEq(pass.curveReserve(), 0);
        assertEq(pass.founderReserve(), 0);
        assertEq(pass.totalSupply(), 0);
        assertFalse(pass.buysPaused());
    }

    function test_constructorRejectsZeroToken() public {
        vm.expectRevert(OGPass.ZeroAddress.selector);
        new OGPass(address(0), root, FOUNDER_COUNT, owner);
    }

    function test_constructorRejectsZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new OGPass(address(og), root, FOUNDER_COUNT, address(0));
    }

    function test_constructorRejectsFounderCountAboveCap() public {
        vm.expectRevert(OGPass.InvalidFounderCount.selector);
        new OGPass(address(og), root, MAX_SUPPLY + 1, owner);
    }

    function test_constructorDoesNotTouchTokenCode() public {
        // The launch rehearses the constructor on an empty chain: a token address without code must work.
        address noCode = makeAddr("no-code-token");
        OGPass p = new OGPass(noCode, root, FOUNDER_COUNT, owner);
        assertEq(address(p.OG()), noCode);
    }

    // =============================================================================================
    // Soulbound
    // =============================================================================================

    function test_soulbound_publicPass() public {
        address alice = publicActor(1);
        uint256 id = buyAs(alice);
        _assertSoulbound(alice, id);
    }

    function test_soulbound_founderPass() public {
        uint256 id = claimAs(0);
        _assertSoulbound(founders[0], id);
    }

    function _assertSoulbound(address holder, uint256 id) internal {
        address bob = publicActor(99);

        vm.startPrank(holder);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.transferFrom(holder, bob, id);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.safeTransferFrom(holder, bob, id);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.safeTransferFrom(holder, bob, id, "");
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.approve(bob, id);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.setApprovalForAll(bob, true);
        vm.stopPrank();

        // A third party cannot move it either, and approvals are never set.
        vm.prank(bob);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.transferFrom(holder, bob, id);
        assertEq(pass.getApproved(id), address(0));
        assertFalse(pass.isApprovedForAll(holder, bob));
        assertEq(pass.ownerOf(id), holder);
    }

    // =============================================================================================
    // Founder claims
    // =============================================================================================

    function test_claimFounder_valid() public {
        vm.expectEmit(true, true, false, true, address(pass));
        emit OGPass.Claim(founders[3], 1);
        uint256 id = claimAs(3);

        assertEq(id, 1);
        assertEq(pass.ownerOf(id), founders[3]);
        assertTrue(pass.isFounder(id));
        assertTrue(pass.isMember(founders[3]));
        assertTrue(pass.hasClaimedFounder(founders[3]));
        assertEq(pass.founderClaimed(), 1);
        assertEq(pass.founderOutstanding(), 1);
        assertEq(pass.totalSupply(), 1);
        assertEq(pass.publicSupply(), 0);
        assertEq(pass.curveReserve(), 0);
    }

    function test_claimFounder_allFortyNine() public {
        for (uint256 i; i < FOUNDER_COUNT; ++i) {
            claimAs(i);
        }
        assertEq(pass.founderClaimed(), FOUNDER_COUNT);
        assertEq(pass.totalSupply(), FOUNDER_COUNT);
        assertEq(pass.reservedFounderSlots(), 0);
    }

    function test_claimFounder_invalidProof_wrongLeaf() public {
        // founder 5 presents founder 6's proof
        vm.prank(founders[5]);
        vm.expectRevert(OGPass.InvalidProof.selector);
        pass.claimFounder(proofFor(6));
    }

    function test_claimFounder_invalidProof_nonFounder() public {
        address stranger = publicActor(7);
        vm.prank(stranger);
        vm.expectRevert(OGPass.InvalidProof.selector);
        pass.claimFounder(proofFor(0));
    }

    function test_claimFounder_invalidProof_empty() public {
        bytes32[] memory empty;
        vm.prank(founders[0]);
        vm.expectRevert(OGPass.InvalidProof.selector);
        pass.claimFounder(empty);
    }

    function test_claimFounder_double() public {
        claimAs(2);
        vm.prank(founders[2]);
        vm.expectRevert(OGPass.AlreadyClaimed.selector);
        pass.claimFounder(proofFor(2));
    }

    function test_claimFounder_doubleAfterBuyback() public {
        // Selling the founder pass back does not restore the claim.
        uint256 id = claimAs(2);
        fundReserve(publicActor(0), FOUNDER_BUYBACK);
        vm.prank(founders[2]);
        pass.sellFounder(id);
        vm.prank(founders[2]);
        vm.expectRevert(OGPass.AlreadyClaimed.selector);
        pass.claimFounder(proofFor(2));
    }

    function test_claimFounder_deadlineBoundary() public {
        vm.warp(pass.claimDeadline() - 1);
        claimAs(0);

        vm.warp(pass.claimDeadline());
        vm.prank(founders[1]);
        vm.expectRevert(OGPass.ClaimClosed.selector);
        pass.claimFounder(proofFor(1));

        vm.warp(pass.claimDeadline() + 365 days);
        vm.prank(founders[1]);
        vm.expectRevert(OGPass.ClaimClosed.selector);
        pass.claimFounder(proofFor(1));
    }

    function test_claimFounder_memberCannotClaim() public {
        // founder 4 first buys a public pass, then tries to claim
        buyAs(founders[4]);
        vm.prank(founders[4]);
        vm.expectRevert(OGPass.AlreadyMember.selector);
        pass.claimFounder(proofFor(4));
    }

    function test_claimFounder_capFromFounderCount() public {
        // A tree with 3 leaves but founderCount = 2: the third valid claim is refused.
        address[] memory three = new address[](3);
        three[0] = founders[0];
        three[1] = founders[1];
        three[2] = founders[2];
        bytes32[] memory l = Merkle.leavesOf(three);
        OGPass p = new OGPass(address(og), Merkle.root(l), 2, owner);
        vm.prank(three[0]);
        p.claimFounder(Merkle.proof(l, 0));
        vm.prank(three[1]);
        p.claimFounder(Merkle.proof(l, 1));
        vm.prank(three[2]);
        vm.expectRevert(OGPass.FounderCapReached.selector);
        p.claimFounder(Merkle.proof(l, 2));
    }

    function test_claimFounder_notPausable() public {
        vm.prank(owner);
        pass.setBuysPaused(true);
        claimAs(0);
    }

    // =============================================================================================
    // Buy
    // =============================================================================================

    function test_buy_firstPass() public {
        address alice = publicActor(1);
        fund(alice, BASE_PRICE);
        assertEq(pass.currentBuyPrice(), BASE_PRICE);

        vm.expectEmit(true, true, false, true, address(pass));
        emit OGPass.Buy(alice, 1, BASE_PRICE, 1);
        vm.prank(alice);
        uint256 id = pass.buy(BASE_PRICE, block.timestamp);

        assertEq(id, 1);
        assertEq(pass.ownerOf(id), alice);
        assertFalse(pass.isFounder(id));
        assertTrue(pass.isMember(alice));
        assertEq(pass.publicSupply(), 1);
        assertEq(pass.curveReserve(), BASE_PRICE);
        assertEq(og.balanceOf(alice), 0);
        assertEq(og.balanceOf(address(pass)), BASE_PRICE);
        assertEq(pass.currentBuyPrice(), BASE_PRICE + PRICE_STEP);
    }

    function test_buy_pricesFollowCurve() public {
        for (uint256 n = 1; n <= 20; ++n) {
            assertEq(pass.currentBuyPrice(), priceOf(n));
            buyAs(publicActor(n));
            assertEq(pass.curveReserve(), sumPrices(n));
        }
    }

    function test_buy_pullsExactlyPriceEvenWithHigherMaxAndAllowance() public {
        address alice = publicActor(1);
        fund(alice, BASE_PRICE * 3);
        vm.prank(alice);
        pass.buy(BASE_PRICE * 3, block.timestamp);
        assertEq(og.balanceOf(alice), BASE_PRICE * 2);
        assertEq(pass.curveReserve(), BASE_PRICE);
    }

    function test_buy_revertsAboveMaxPrice() public {
        address alice = publicActor(1);
        fund(alice, BASE_PRICE);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OGPass.PriceAboveMax.selector, BASE_PRICE, BASE_PRICE - 1));
        pass.buy(BASE_PRICE - 1, block.timestamp);
    }

    function test_buy_slippageAfterFrontRun() public {
        address alice = publicActor(1);
        address bob = publicActor(2);
        fund(alice, BASE_PRICE + PRICE_STEP);
        buyAs(bob); // bob gets in first, price moves up one step
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OGPass.PriceAboveMax.selector, BASE_PRICE + PRICE_STEP, BASE_PRICE));
        pass.buy(BASE_PRICE, block.timestamp);
    }

    function test_buy_revertsPastDeadline() public {
        address alice = publicActor(1);
        fund(alice, BASE_PRICE);
        vm.prank(alice);
        vm.expectRevert(OGPass.Expired.selector);
        pass.buy(BASE_PRICE, block.timestamp - 1);
    }

    function test_buy_deadlineInclusive() public {
        address alice = publicActor(1);
        fund(alice, BASE_PRICE);
        vm.prank(alice);
        pass.buy(BASE_PRICE, block.timestamp);
        assertTrue(pass.isMember(alice));
    }

    function test_buy_revertsWithoutAllowance() public {
        address alice = publicActor(1);
        og.mint(alice, BASE_PRICE);
        vm.prank(alice);
        vm.expectRevert();
        pass.buy(BASE_PRICE, block.timestamp);
        assertEq(pass.publicSupply(), 0);
    }

    function test_buy_revertsWhenPaused() public {
        vm.prank(owner);
        pass.setBuysPaused(true);
        address alice = publicActor(1);
        fund(alice, BASE_PRICE);
        vm.prank(alice);
        vm.expectRevert(OGPass.BuysPaused.selector);
        pass.buy(BASE_PRICE, block.timestamp);
    }

    function test_buy_rejectsFeeOnTransferToken() public {
        FeeOnTransferOG fee = new FeeOnTransferOG();
        OGPass p = new OGPass(address(fee), root, FOUNDER_COUNT, owner);
        address alice = publicActor(1);
        fee.mint(alice, BASE_PRICE);
        vm.startPrank(alice);
        fee.approve(address(p), BASE_PRICE);
        uint256 received = BASE_PRICE - (BASE_PRICE * fee.FEE_BPS()) / 10_000;
        vm.expectRevert(abi.encodeWithSelector(OGPass.AmountMismatch.selector, BASE_PRICE, received));
        p.buy(BASE_PRICE, block.timestamp);
        vm.stopPrank();
        assertEq(p.publicSupply(), 0);
        assertEq(p.curveReserve(), 0);
    }

    // =============================================================================================
    // Sell
    // =============================================================================================

    function test_sell_singlePass() public {
        address alice = publicActor(1);
        uint256 id = buyAs(alice);
        uint256 payout = (BASE_PRICE * 9250) / 10_000;
        uint256 burned = BASE_PRICE - payout;
        assertEq(pass.currentSellPrice(), payout);

        vm.expectEmit(true, true, false, true, address(pass));
        emit OGPass.Sell(alice, id, BASE_PRICE, payout, burned);
        vm.prank(alice);
        uint256 got = pass.sell(id, payout, block.timestamp);

        assertEq(got, payout);
        assertEq(og.balanceOf(alice), payout);
        assertEq(og.balanceOf(DEAD), burned);
        assertEq(og.balanceOf(address(pass)), 0);
        assertEq(pass.curveReserve(), 0);
        assertEq(pass.publicSupply(), 0);
        assertEq(pass.currentSellPrice(), 0);
        assertFalse(pass.isMember(alice));
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        pass.ownerOf(id);
    }

    function test_sell_payoutUsesCurrentSupplyNotPurchasePrice() public {
        address alice = publicActor(1);
        address bob = publicActor(2);
        uint256 aliceId = buyAs(alice); // paid P(1)
        buyAs(bob); // paid P(2)
        // Alice sells while supply is 2: she receives 92.5% of P(2), not of P(1).
        uint256 expected = (priceOf(2) * 9250) / 10_000;
        uint256 got = sellAs(alice, aliceId);
        assertEq(got, expected);
        assertEq(pass.curveReserve(), priceOf(1));
    }

    function test_sell_revertsBelowMinOut() public {
        address alice = publicActor(1);
        uint256 id = buyAs(alice);
        uint256 payout = (BASE_PRICE * 9250) / 10_000;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OGPass.PayoutBelowMin.selector, payout, payout + 1));
        pass.sell(id, payout + 1, block.timestamp);
    }

    function test_sell_slippageAfterSomeoneElseSells() public {
        address alice = publicActor(1);
        address bob = publicActor(2);
        uint256 aliceId = buyAs(alice);
        uint256 bobId = buyAs(bob);
        uint256 quoted = pass.currentSellPrice();
        sellAs(bob, bobId); // bob exits first; alice's quote is now lower
        uint256 nowQuoted = pass.currentSellPrice();
        assertLt(nowQuoted, quoted);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OGPass.PayoutBelowMin.selector, nowQuoted, quoted));
        pass.sell(aliceId, quoted, block.timestamp);
    }

    function test_sell_revertsPastDeadline() public {
        address alice = publicActor(1);
        uint256 id = buyAs(alice);
        vm.prank(alice);
        vm.expectRevert(OGPass.Expired.selector);
        pass.sell(id, 0, block.timestamp - 1);
    }

    function test_sell_revertsNotOwner() public {
        address alice = publicActor(1);
        address bob = publicActor(2);
        uint256 id = buyAs(alice);
        vm.prank(bob);
        vm.expectRevert(OGPass.NotTokenOwner.selector);
        pass.sell(id, 0, block.timestamp);
        vm.prank(bob);
        vm.expectRevert(OGPass.NotTokenOwner.selector);
        pass.sell(999, 0, block.timestamp);
    }

    function test_sell_revertsForFounderPass() public {
        uint256 id = claimAs(0);
        buyAs(publicActor(1)); // put something in the curve reserve to be sure it is untouched
        vm.prank(founders[0]);
        vm.expectRevert(OGPass.NotPublicPass.selector);
        pass.sell(id, 0, block.timestamp);
        assertEq(pass.curveReserve(), BASE_PRICE);
    }

    function test_sell_notPausable() public {
        address alice = publicActor(1);
        uint256 id = buyAs(alice);
        vm.prank(owner);
        pass.setBuysPaused(true);
        sellAs(alice, id);
        assertEq(pass.publicSupply(), 0);
    }

    function test_sell_everyOrderEmptiesReserve() public {
        uint256 n = 7;
        uint256[] memory ids = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            ids[i] = buyAs(publicActor(i));
        }
        // sell in an interleaved order: 3, 0, 6, 1, 5, 2, 4
        uint256[7] memory order = [uint256(3), 0, 6, 1, 5, 2, 4];
        for (uint256 k; k < n; ++k) {
            uint256 i = order[k];
            sellAs(publicActor(i), ids[i]);
            assertEq(pass.curveReserve(), sumPrices(pass.publicSupply()));
        }
        assertEq(pass.curveReserve(), 0);
        assertEq(og.balanceOf(address(pass)), 0);
    }

    function test_sell_thenBuyAgainSameWallet() public {
        address alice = publicActor(1);
        uint256 id = buyAs(alice);
        sellAs(alice, id);
        uint256 id2 = buyAs(alice);
        assertEq(id2, 2);
        assertEq(pass.publicSupply(), 1);
    }

    function test_sell_reentrancyGuardHolds() public {
        ReentrantOG rog = new ReentrantOG();
        OGPass p = new OGPass(address(rog), root, FOUNDER_COUNT, owner);
        address alice = publicActor(1);
        rog.mint(alice, BASE_PRICE);
        vm.startPrank(alice);
        rog.approve(address(p), BASE_PRICE);
        uint256 id = p.buy(BASE_PRICE, block.timestamp);
        rog.arm(p, id);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        p.sell(id, 0, block.timestamp);
        vm.stopPrank();
        // nothing changed
        assertEq(p.publicSupply(), 1);
        assertEq(p.ownerOf(id), alice);
    }

    // =============================================================================================
    // One pass per wallet
    // =============================================================================================

    function test_onePerWallet_buyTwice() public {
        address alice = publicActor(1);
        buyAs(alice);
        fund(alice, pass.currentBuyPrice());
        vm.prank(alice);
        vm.expectRevert(OGPass.AlreadyMember.selector);
        pass.buy(type(uint256).max, block.timestamp);
    }

    function test_onePerWallet_founderCannotBuy() public {
        claimAs(0);
        fund(founders[0], BASE_PRICE);
        vm.prank(founders[0]);
        vm.expectRevert(OGPass.AlreadyMember.selector);
        pass.buy(BASE_PRICE, block.timestamp);
    }

    function test_onePerWallet_founderCanBuyAfterBuyback() public {
        uint256 id = claimAs(0);
        fundReserve(publicActor(9), FOUNDER_BUYBACK);
        vm.prank(founders[0]);
        pass.sellFounder(id);
        buyAs(founders[0]);
        assertEq(pass.balanceOf(founders[0]), 1);
        assertFalse(pass.isFounder(2));
    }

    // =============================================================================================
    // Founder buyback and reserve
    // =============================================================================================

    function test_fundFounderReserve() public {
        address donor = publicActor(5);
        fund(donor, 250_000e18);
        vm.expectEmit(true, false, false, true, address(pass));
        emit OGPass.ReserveFunded(donor, 250_000e18, 250_000e18);
        vm.prank(donor);
        pass.fundFounderReserve(250_000e18);
        assertEq(pass.founderReserve(), 250_000e18);
        assertEq(pass.curveReserve(), 0);
        assertEq(og.balanceOf(address(pass)), 250_000e18);
    }

    function test_fundFounderReserve_zeroReverts() public {
        vm.expectRevert(OGPass.ZeroAmount.selector);
        pass.fundFounderReserve(0);
    }

    function test_fundFounderReserve_rejectsFeeOnTransfer() public {
        FeeOnTransferOG fee = new FeeOnTransferOG();
        OGPass p = new OGPass(address(fee), root, FOUNDER_COUNT, owner);
        address donor = publicActor(5);
        fee.mint(donor, 1e18);
        vm.startPrank(donor);
        fee.approve(address(p), 1e18);
        vm.expectRevert(abi.encodeWithSelector(OGPass.AmountMismatch.selector, 1e18, 1e18 - 1e16));
        p.fundFounderReserve(1e18);
        vm.stopPrank();
        assertEq(p.founderReserve(), 0);
    }

    function test_sellFounder_paysExactlyBuyback() public {
        uint256 id = claimAs(1);
        fundReserve(publicActor(5), 250_000e18);

        vm.expectEmit(true, true, false, true, address(pass));
        emit OGPass.FounderSell(founders[1], id, FOUNDER_BUYBACK);
        vm.prank(founders[1]);
        pass.sellFounder(id);

        assertEq(og.balanceOf(founders[1]), FOUNDER_BUYBACK);
        assertEq(pass.founderReserve(), 150_000e18);
        assertEq(pass.founderOutstanding(), 0);
        assertEq(pass.founderClaimed(), 1);
        assertFalse(pass.isFounder(id));
        assertFalse(pass.isMember(founders[1]));
        assertEq(pass.totalSupply(), 0);
        assertEq(og.balanceOf(DEAD), 0);
    }

    function test_sellFounder_doesNotTouchCurveReserve() public {
        uint256 id = claimAs(1);
        buyAs(publicActor(1));
        fundReserve(publicActor(5), FOUNDER_BUYBACK);
        vm.prank(founders[1]);
        pass.sellFounder(id);
        assertEq(pass.curveReserve(), BASE_PRICE);
        assertEq(pass.founderReserve(), 0);
        assertEq(og.balanceOf(address(pass)), BASE_PRICE);
    }

    function test_sellFounder_revertsWithoutReserve() public {
        uint256 id = claimAs(1);
        fundReserve(publicActor(5), FOUNDER_BUYBACK - 1);
        vm.prank(founders[1]);
        vm.expectRevert(
            abi.encodeWithSelector(OGPass.InsufficientFounderReserve.selector, FOUNDER_BUYBACK - 1, FOUNDER_BUYBACK)
        );
        pass.sellFounder(id);
        assertEq(pass.ownerOf(id), founders[1]);
    }

    function test_sellFounder_reserveNotSharedWithCurve() public {
        // Curve reserve holds 1,000,000 OG but the founder reserve is empty: buyback must fail.
        uint256 id = claimAs(1);
        buyAs(publicActor(1));
        vm.prank(founders[1]);
        vm.expectRevert(abi.encodeWithSelector(OGPass.InsufficientFounderReserve.selector, 0, FOUNDER_BUYBACK));
        pass.sellFounder(id);
    }

    function test_sellFounder_revertsNotOwner() public {
        uint256 id = claimAs(1);
        fundReserve(publicActor(5), FOUNDER_BUYBACK);
        vm.prank(founders[2]);
        vm.expectRevert(OGPass.NotTokenOwner.selector);
        pass.sellFounder(id);
    }

    function test_sellFounder_revertsForPublicPass() public {
        address alice = publicActor(1);
        uint256 id = buyAs(alice);
        fundReserve(publicActor(5), FOUNDER_BUYBACK);
        vm.prank(alice);
        vm.expectRevert(OGPass.NotFounderPass.selector);
        pass.sellFounder(id);
    }

    function test_sellFounder_worksAfterDeadlineAndWhenPaused() public {
        uint256 id = claimAs(1);
        fundReserve(publicActor(5), FOUNDER_BUYBACK);
        vm.prank(owner);
        pass.setBuysPaused(true);
        vm.warp(pass.claimDeadline() + 10 days);
        vm.prank(founders[1]);
        pass.sellFounder(id);
        assertEq(og.balanceOf(founders[1]), FOUNDER_BUYBACK);
    }

    // =============================================================================================
    // burnUnclaimedFounderReserve
    // =============================================================================================

    function test_burnUnclaimed_revertsBeforeDeadline() public {
        fundReserve(publicActor(5), 1_000_000e18);
        vm.warp(pass.claimDeadline() - 1);
        vm.expectRevert(OGPass.ClaimStillOpen.selector);
        pass.burnUnclaimedFounderReserve();
    }

    function test_burnUnclaimed_math() public {
        claimAs(0);
        claimAs(1);
        claimAs(2);
        fundReserve(publicActor(5), 1_000_000e18);
        vm.warp(pass.claimDeadline());

        address caller = publicActor(8);
        vm.expectEmit(true, false, false, true, address(pass));
        emit OGPass.ReserveBurned(caller, 700_000e18, 300_000e18);
        vm.prank(caller);
        uint256 burned = pass.burnUnclaimedFounderReserve();

        assertEq(burned, 700_000e18);
        assertEq(pass.founderReserve(), 300_000e18);
        assertEq(og.balanceOf(DEAD), 700_000e18);
        assertEq(og.balanceOf(address(pass)), 300_000e18);

        // The three founders can still be bought back in full afterwards.
        for (uint256 i; i < 3; ++i) {
            vm.prank(founders[i]);
            pass.sellFounder(i + 1);
            assertEq(og.balanceOf(founders[i]), FOUNDER_BUYBACK);
        }
        assertEq(pass.founderReserve(), 0);
        assertEq(og.balanceOf(address(pass)), 0);
    }

    function test_burnUnclaimed_nothingToBurnWhenExactlyCovered() public {
        claimAs(0);
        fundReserve(publicActor(5), FOUNDER_BUYBACK);
        vm.warp(pass.claimDeadline());
        vm.expectRevert(OGPass.NothingToBurn.selector);
        pass.burnUnclaimedFounderReserve();
    }

    function test_burnUnclaimed_nothingToBurnWhenUnderfunded() public {
        claimAs(0);
        claimAs(1);
        fundReserve(publicActor(5), 150_000e18);
        vm.warp(pass.claimDeadline());
        vm.expectRevert(OGPass.NothingToBurn.selector);
        pass.burnUnclaimedFounderReserve();
        assertEq(pass.founderReserve(), 150_000e18);
    }

    function test_burnUnclaimed_nothingToBurnWhenEmpty() public {
        vm.warp(pass.claimDeadline());
        vm.expectRevert(OGPass.NothingToBurn.selector);
        pass.burnUnclaimedFounderReserve();
    }

    function test_burnUnclaimed_noFoundersBurnsEverything() public {
        fundReserve(publicActor(5), 42e18);
        vm.warp(pass.claimDeadline() + 1);
        uint256 burned = pass.burnUnclaimedFounderReserve();
        assertEq(burned, 42e18);
        assertEq(pass.founderReserve(), 0);
        assertEq(og.balanceOf(DEAD), 42e18);
    }

    function test_burnUnclaimed_repeatableAfterNewFunding() public {
        claimAs(0);
        fundReserve(publicActor(5), 300_000e18);
        vm.warp(pass.claimDeadline() + 1);
        assertEq(pass.burnUnclaimedFounderReserve(), 200_000e18);
        vm.expectRevert(OGPass.NothingToBurn.selector);
        pass.burnUnclaimedFounderReserve();

        fundReserve(publicActor(6), 50_000e18);
        assertEq(pass.burnUnclaimedFounderReserve(), 50_000e18);
        assertEq(pass.founderReserve(), FOUNDER_BUYBACK);

        // After the founder exits, a later deposit is fully excess.
        vm.prank(founders[0]);
        pass.sellFounder(1);
        assertEq(pass.founderReserve(), 0);
        fundReserve(publicActor(6), 1e18);
        assertEq(pass.burnUnclaimedFounderReserve(), 1e18);
    }

    // =============================================================================================
    // Supply cap
    // =============================================================================================

    function test_cap_publicStopsAtNineFiftyOneWhileFoundersReserved() public {
        for (uint256 i; i < MAX_SUPPLY - FOUNDER_COUNT; ++i) {
            buyAs(publicActor(i));
        }
        assertEq(pass.publicSupply(), 951);
        assertEq(pass.reservedFounderSlots(), 49);

        address late = publicActor(5000);
        fund(late, pass.currentBuyPrice());
        vm.prank(late);
        vm.expectRevert(OGPass.SupplyCapReached.selector);
        pass.buy(type(uint256).max, block.timestamp);

        // Every founder can still claim.
        uint256 firstFounderId = claimAs(0);
        assertEq(firstFounderId, 952);
        for (uint256 i = 1; i < FOUNDER_COUNT; ++i) {
            claimAs(i);
        }
        assertEq(pass.totalSupply(), MAX_SUPPLY);

        // A burned public pass frees exactly one slot.
        sellAs(publicActor(0), 1);
        buyAs(late);
        assertEq(pass.totalSupply(), MAX_SUPPLY);
        address later = publicActor(5001);
        fund(later, pass.currentBuyPrice());
        vm.prank(later);
        vm.expectRevert(OGPass.SupplyCapReached.selector);
        pass.buy(type(uint256).max, block.timestamp);

        // A founder buyback frees one slot too.
        fundReserve(publicActor(6000), FOUNDER_BUYBACK);
        vm.prank(founders[0]);
        pass.sellFounder(firstFounderId);
        buyAs(later);
        assertEq(pass.totalSupply(), MAX_SUPPLY);
    }

    function test_cap_unclaimedFounderSlotsOpenAfterDeadline() public {
        for (uint256 i; i < 10; ++i) {
            claimAs(i);
        }
        for (uint256 i; i < MAX_SUPPLY - FOUNDER_COUNT; ++i) {
            buyAs(publicActor(i));
        }
        address late = publicActor(5000);
        fund(late, pass.currentBuyPrice() * 2);
        vm.prank(late);
        vm.expectRevert(OGPass.SupplyCapReached.selector);
        pass.buy(type(uint256).max, block.timestamp);

        vm.warp(pass.claimDeadline());
        assertEq(pass.reservedFounderSlots(), 0);
        // 39 unclaimed founder slots are now available to the public.
        for (uint256 i; i < 39; ++i) {
            buyAs(publicActor(10_000 + i));
        }
        assertEq(pass.totalSupply(), MAX_SUPPLY);
        vm.prank(late);
        vm.expectRevert(OGPass.SupplyCapReached.selector);
        pass.buy(type(uint256).max, block.timestamp);
        assertEq(pass.curveReserve(), sumPrices(pass.publicSupply()));
    }

    // =============================================================================================
    // Owner powers
    // =============================================================================================

    function test_pause_onlyOwnerAndOnlyBuys() public {
        address alice = publicActor(1);
        uint256 aliceId = buyAs(alice);
        uint256 founderId = claimAs(0);
        fundReserve(publicActor(5), FOUNDER_BUYBACK);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        pass.setBuysPaused(true);

        vm.expectEmit(false, false, false, true, address(pass));
        emit OGPass.BuyPause(true);
        vm.prank(owner);
        pass.setBuysPaused(true);
        assertTrue(pass.buysPaused());

        // buys blocked
        address bob = publicActor(2);
        fund(bob, pass.currentBuyPrice());
        vm.prank(bob);
        vm.expectRevert(OGPass.BuysPaused.selector);
        pass.buy(type(uint256).max, block.timestamp);

        // everything else works
        claimAs(1);
        fundReserve(publicActor(6), 1e18);
        sellAs(alice, aliceId);
        vm.prank(founders[0]);
        pass.sellFounder(founderId);

        vm.expectEmit(false, false, false, true, address(pass));
        emit OGPass.BuyPause(false);
        vm.prank(owner);
        pass.setBuysPaused(false);
        vm.prank(bob);
        pass.buy(type(uint256).max, block.timestamp);
        assertTrue(pass.isMember(bob));
    }

    function test_setBaseURI() public {
        uint256 id = buyAs(publicActor(1));
        assertEq(pass.tokenURI(id), "");

        vm.prank(publicActor(1));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, publicActor(1)));
        pass.setBaseURI("https://x/");

        vm.expectEmit(false, false, false, true, address(pass));
        emit OGPass.BaseURIUpdated("https://og.example/pass/");
        vm.prank(owner);
        pass.setBaseURI("https://og.example/pass/");
        assertEq(pass.tokenURI(id), "https://og.example/pass/1");
    }

    function test_ownershipHandoverIsTwoStep() public {
        address next = makeAddr("next-owner");
        vm.prank(owner);
        pass.transferOwnership(next);
        assertEq(pass.owner(), owner);
        assertEq(pass.pendingOwner(), next);
        vm.prank(next);
        pass.acceptOwnership();
        assertEq(pass.owner(), next);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        pass.setBuysPaused(true);
    }

    function test_ownerCannotExtractReserves() public {
        // The contract exposes no withdrawal path: after activity, the only OG that ever leaves goes to
        // sellers, founders and the burn address. The owner's balance never moves.
        uint256 aliceId = buyAs(publicActor(1));
        fundReserve(publicActor(5), 500_000e18);
        assertEq(og.balanceOf(owner), 0);
        sellAs(publicActor(1), aliceId);
        vm.warp(pass.claimDeadline());
        pass.burnUnclaimedFounderReserve();
        assertEq(og.balanceOf(owner), 0);
        assertEq(og.balanceOf(address(pass)), 0);
    }

    // =============================================================================================
    // Views
    // =============================================================================================

    function test_views() public {
        assertEq(pass.currentBuyPrice(), BASE_PRICE);
        assertEq(pass.currentSellPrice(), 0);
        assertFalse(pass.isMember(publicActor(1)));
        assertFalse(pass.isFounder(1));
        assertEq(pass.priceOf(1), BASE_PRICE);
        assertEq(pass.priceOf(951), BASE_PRICE + PRICE_STEP * 950);
        vm.expectRevert(OGPass.ZeroAmount.selector);
        pass.priceOf(0);

        buyAs(publicActor(1));
        buyAs(publicActor(2));
        assertEq(pass.currentBuyPrice(), priceOf(3));
        assertEq(pass.currentSellPrice(), (priceOf(2) * 9250) / 10_000);
        assertEq(pass.publicSupply(), 2);
        assertEq(pass.totalSupply(), 2);
        assertTrue(pass.isMember(publicActor(1)));
    }

    function test_supportsInterface() public view {
        assertTrue(pass.supportsInterface(0x80ac58cd)); // ERC721
        assertTrue(pass.supportsInterface(0x5b5e139f)); // ERC721Metadata
        assertTrue(pass.supportsInterface(0x01ffc9a7)); // ERC165
    }
}
