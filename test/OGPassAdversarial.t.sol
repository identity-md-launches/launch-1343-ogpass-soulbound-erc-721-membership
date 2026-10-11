// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OGPassBase} from "./OGPassBase.sol";
import {OGPass} from "../src/OGPass.sol";
import {MockOG} from "./mocks/MockOG.sol";
import {OverDeliverOG, FalseReturnOG, NoReturnOG, WelcomingReceiver} from "./mocks/HostileOG.sol";
import {Merkle} from "./helpers/Merkle.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Adversarial edge cases the base suite does not send: hostile tokens, hidden-function probes,
///         burn-by-transfer attempts, tampered and degenerate Merkle trees, duplicate exits, and the full
///         1,000-pass lifecycle unwound to zero.
contract OGPassAdversarialTest is OGPassBase {
    uint256 internal constant SELL_BPS = 9250;
    uint256 internal constant BPS = 10_000;

    // =============================================================================================
    // No hidden owner powers: the brief forbids withdrawals, price/root/deadline changes and upgrades.
    // =============================================================================================

    function test_noHiddenPrivilegedFunctions() public {
        // Fill the contract with value first so a successful probe would have something to take.
        buyAs(publicActor(1));
        fundReserve(publicActor(2), 500_000e18);
        uint256 balanceBefore = og.balanceOf(address(pass));

        string[34] memory sigs = [
            "withdraw()",
            "withdraw(uint256)",
            "withdraw(address,uint256)",
            "withdrawToken(address,uint256)",
            "withdrawOG(uint256)",
            "sweep(address)",
            "sweep(address,address)",
            "rescue(address,uint256)",
            "rescueERC20(address,uint256)",
            "recoverERC20(address,uint256)",
            "emergencyWithdraw()",
            "skim(address)",
            "claimFees()",
            "setPrice(uint256)",
            "setBasePrice(uint256)",
            "setPriceStep(uint256)",
            "setSellBps(uint256)",
            "setFounderBuyback(uint256)",
            "setFounderRoot(bytes32)",
            "setRoot(bytes32)",
            "setMerkleRoot(bytes32)",
            "setClaimDeadline(uint256)",
            "setDeadline(uint256)",
            "extendDeadline(uint256)",
            "setFounderCount(uint256)",
            "setMaxSupply(uint256)",
            "pause()",
            "unpause()",
            "setPaused(bool)",
            "setSellsPaused(bool)",
            "mint(address)",
            "mint(address,uint256)",
            "upgradeTo(address)",
            "upgradeToAndCall(address,bytes)"
        ];
        for (uint256 i; i < sigs.length; ++i) {
            bytes memory data = abi.encodePacked(bytes4(keccak256(bytes(sigs[i]))), new bytes(64));
            vm.prank(owner);
            (bool ok,) = address(pass).call(data);
            assertFalse(ok, sigs[i]);
        }

        // No fallback and no receive: random calldata and plain ETH both bounce.
        vm.prank(owner);
        (bool okRandom,) = address(pass).call(hex"deadbeef");
        assertFalse(okRandom, "fallback");
        vm.deal(owner, 1 ether);
        vm.prank(owner);
        (bool okEth,) = address(pass).call{value: 1 ether}("");
        assertFalse(okEth, "receive");
        (bool okEthData,) = address(pass).call{value: 1}(abi.encodeWithSignature("setBuysPaused(bool)", true));
        assertFalse(okEthData, "nonpayable");

        assertEq(og.balanceOf(address(pass)), balanceBefore);
        assertEq(og.balanceOf(owner), 0);
        assertEq(address(pass).balance, 0);
    }

    function test_pendingOwnerHasNoPowerUntilAccepted() public {
        address next = makeAddr("next-owner");
        vm.prank(owner);
        pass.transferOwnership(next);
        vm.prank(next);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, next));
        pass.setBuysPaused(true);
        vm.prank(next);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, next));
        pass.setBaseURI("x");
        // The current owner keeps its powers while the handover is pending.
        vm.prank(owner);
        pass.setBuysPaused(true);
        assertTrue(pass.buysPaused());
    }

    function test_renouncedOwnerFreezesPauseStateButNeverExits() public {
        address alice = publicActor(1);
        uint256 aliceId = buyAs(alice);
        uint256 founderId = claimAs(0);
        fundReserve(publicActor(3), FOUNDER_BUYBACK);

        vm.startPrank(owner);
        pass.setBuysPaused(true);
        pass.renounceOwnership();
        vm.stopPrank();
        assertEq(pass.owner(), address(0));

        // Nobody can unpause any more: new buys are closed for good.
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        pass.setBuysPaused(false);
        address bob = publicActor(2);
        fund(bob, pass.currentBuyPrice());
        vm.prank(bob);
        vm.expectRevert(OGPass.BuysPaused.selector);
        pass.buy(type(uint256).max, block.timestamp);

        // But every exit path and every claim still works, so no OG is ever trapped by the owner.
        claimAs(1);
        sellAs(alice, aliceId);
        vm.prank(founders[0]);
        pass.sellFounder(founderId);
        assertEq(pass.curveReserve(), 0);
        assertEq(og.balanceOf(alice), (BASE_PRICE * SELL_BPS) / BPS);
        assertEq(og.balanceOf(founders[0]), FOUNDER_BUYBACK);
    }

    function test_pauseDoesNotBlockReserveFundingOrBurn() public {
        claimAs(0);
        vm.prank(owner);
        pass.setBuysPaused(true);
        fundReserve(publicActor(3), 250_000e18);
        assertEq(pass.founderReserve(), 250_000e18);
        vm.warp(pass.claimDeadline());
        assertEq(pass.burnUnclaimedFounderReserve(), 150_000e18);
        assertTrue(pass.buysPaused());
    }

    // =============================================================================================
    // Soulbound: the paths the base suite does not try
    // =============================================================================================

    function test_cannotBurnByTransferringToZero() public {
        // A transfer to address(0) would be a burn that bypasses the curve accounting. It must not exist.
        address alice = publicActor(1);
        uint256 id = buyAs(alice);
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(0)));
        pass.transferFrom(alice, address(0), id);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(0)));
        pass.safeTransferFrom(alice, address(0), id);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(0)));
        pass.safeTransferFrom(alice, address(0), id, "");
        vm.stopPrank();
        assertEq(pass.ownerOf(id), alice);
        assertEq(pass.publicSupply(), 1);
        assertEq(pass.curveReserve(), BASE_PRICE);
    }

    function test_selfTransferReverts() public {
        address alice = publicActor(1);
        uint256 id = buyAs(alice);
        vm.prank(alice);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.transferFrom(alice, alice, id);
        vm.prank(alice);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.safeTransferFrom(alice, alice, id);
    }

    function test_safeTransferToWillingContractStillReverts() public {
        WelcomingReceiver receiver = new WelcomingReceiver();
        address alice = publicActor(1);
        uint256 id = buyAs(alice);
        vm.prank(alice);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.safeTransferFrom(alice, address(receiver), id, "hello");
        assertEq(receiver.received(), 0);
        assertEq(pass.ownerOf(id), alice);
    }

    function test_transferOfNonexistentTokenReverts() public {
        address alice = publicActor(1);
        vm.prank(alice);
        vm.expectRevert();
        pass.transferFrom(alice, publicActor(2), 1);
        vm.prank(alice);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.approve(publicActor(2), 1);
    }

    function testFuzz_approvalsNeverSettable(address operator, uint256 tokenId, bool flag) public {
        address alice = publicActor(1);
        buyAs(alice);
        vm.prank(alice);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.approve(operator, tokenId);
        vm.prank(alice);
        vm.expectRevert(OGPass.Soulbound.selector);
        pass.setApprovalForAll(operator, flag);
        assertFalse(pass.isApprovedForAll(alice, operator));
    }

    // =============================================================================================
    // Hostile payment tokens: the received amount is verified on every deposit
    // =============================================================================================

    function test_overDeliveringTokenRejected() public {
        OverDeliverOG bonus = new OverDeliverOG();
        OGPass p = new OGPass(address(bonus), root, FOUNDER_COUNT, owner);
        address alice = publicActor(1);
        bonus.mint(alice, BASE_PRICE);
        vm.startPrank(alice);
        bonus.approve(address(p), BASE_PRICE);
        vm.expectRevert(abi.encodeWithSelector(OGPass.AmountMismatch.selector, BASE_PRICE, BASE_PRICE + 1));
        p.buy(BASE_PRICE, block.timestamp);
        bonus.approve(address(p), 1e18);
        vm.expectRevert(abi.encodeWithSelector(OGPass.AmountMismatch.selector, 1e18, 1e18 + 1));
        p.fundFounderReserve(1e18);
        vm.stopPrank();
        assertEq(p.publicSupply(), 0);
        assertEq(p.curveReserve(), 0);
        assertEq(p.founderReserve(), 0);
    }

    function test_falseReturningTokenRejected() public {
        FalseReturnOG liar = new FalseReturnOG();
        OGPass p = new OGPass(address(liar), root, FOUNDER_COUNT, owner);
        address alice = publicActor(1);
        liar.mint(alice, BASE_PRICE);
        vm.startPrank(alice);
        liar.approve(address(p), BASE_PRICE);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(liar)));
        p.buy(BASE_PRICE, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(liar)));
        p.fundFounderReserve(1);
        vm.stopPrank();
        assertEq(p.publicSupply(), 0);
        assertEq(p.founderReserve(), 0);
    }

    function test_noReturnTokenAccepted() public {
        // SafeERC20 must tolerate a token that returns no boolean; the pass must still measure exactly.
        NoReturnOG usdtLike = new NoReturnOG();
        OGPass p = new OGPass(address(usdtLike), root, FOUNDER_COUNT, owner);
        address alice = publicActor(1);
        usdtLike.mint(alice, BASE_PRICE);
        vm.startPrank(alice);
        usdtLike.approve(address(p), BASE_PRICE);
        uint256 id = p.buy(BASE_PRICE, block.timestamp);
        assertEq(usdtLike.balanceOf(address(p)), BASE_PRICE);
        uint256 payout = p.sell(id, 0, block.timestamp);
        vm.stopPrank();
        assertEq(payout, (BASE_PRICE * SELL_BPS) / BPS);
        assertEq(usdtLike.balanceOf(alice), payout);
        assertEq(usdtLike.balanceOf(DEAD), BASE_PRICE - payout);
        assertEq(usdtLike.balanceOf(address(p)), 0);
    }

    function test_deadTokenAddressBlocksBuysButNotClaims() public {
        // On a chain where the OG address has no code (or the token is gone), nothing can be bought or
        // funded, but founder claims never touch the token and must keep working.
        address noCode = makeAddr("no-code-token");
        OGPass p = new OGPass(noCode, root, FOUNDER_COUNT, owner);
        address alice = publicActor(1);
        vm.prank(alice);
        vm.expectRevert();
        p.buy(BASE_PRICE, block.timestamp);
        vm.prank(alice);
        vm.expectRevert();
        p.fundFounderReserve(1);
        vm.prank(founders[0]);
        uint256 id = p.claimFounder(proofFor(0));
        assertTrue(p.isFounder(id));
        assertEq(p.totalSupply(), 1);
    }

    function test_directDonationIsNotCountedInAnyReserve() public {
        // OG pushed in by plain transfer is neither curve nor founder reserve and never reaches a founder.
        uint256 id = claimAs(0);
        og.mint(address(pass), FOUNDER_BUYBACK);
        assertEq(pass.founderReserve(), 0);
        assertEq(pass.curveReserve(), 0);
        vm.prank(founders[0]);
        vm.expectRevert(abi.encodeWithSelector(OGPass.InsufficientFounderReserve.selector, 0, FOUNDER_BUYBACK));
        pass.sellFounder(id);
        vm.warp(pass.claimDeadline());
        vm.expectRevert(OGPass.NothingToBurn.selector);
        pass.burnUnclaimedFounderReserve();
        // Curve accounting is unaffected by the stray balance.
        uint256 aliceId = buyAs(publicActor(1));
        sellAs(publicActor(1), aliceId);
        assertEq(pass.curveReserve(), 0);
        assertEq(og.balanceOf(address(pass)), FOUNDER_BUYBACK);
    }

    // =============================================================================================
    // Merkle: tampered proofs, degenerate trees, and grounding the test helper against OpenZeppelin
    // =============================================================================================

    function testFuzz_merkleHelperAgreesWithOpenZeppelin(uint8 nRaw, uint8 idxRaw, uint256 seed) public pure {
        // Grounds the harness: a tree built by the test helper verifies under OZ's MerkleProof for every leaf.
        uint256 n = bound(uint256(nRaw), 1, 64);
        uint256 idx = bound(uint256(idxRaw), 0, n - 1);
        address[] memory accounts = new address[](n);
        for (uint256 i; i < n; ++i) {
            accounts[i] = address(uint160(uint256(keccak256(abi.encode(seed, i)))));
        }
        bytes32[] memory l = Merkle.leavesOf(accounts);
        bytes32 r = Merkle.root(l);
        assertTrue(MerkleProof.verify(Merkle.proof(l, idx), r, Merkle.leafOf(accounts[idx])));
        if (n > 1) {
            assertFalse(MerkleProof.verify(Merkle.proof(l, idx), r, Merkle.leafOf(accounts[(idx + 1) % n])));
        }
    }

    function testFuzz_tamperedProofElementRejected(uint8 idxRaw, uint8 posRaw, bytes32 garbage) public {
        uint256 idx = bound(uint256(idxRaw), 0, FOUNDER_COUNT - 1);
        bytes32[] memory p = proofFor(idx);
        uint256 pos = bound(uint256(posRaw), 0, p.length - 1);
        if (garbage == p[pos]) garbage = ~garbage;
        p[pos] = garbage;
        vm.prank(founders[idx]);
        vm.expectRevert(OGPass.InvalidProof.selector);
        pass.claimFounder(p);
        assertFalse(pass.hasClaimedFounder(founders[idx]));
    }

    function testFuzz_truncatedOrExtendedProofRejected(uint8 idxRaw, bytes32 extra) public {
        uint256 idx = bound(uint256(idxRaw), 0, FOUNDER_COUNT - 1);
        bytes32[] memory p = proofFor(idx);

        bytes32[] memory longer = new bytes32[](p.length + 1);
        for (uint256 i; i < p.length; ++i) {
            longer[i] = p[i];
        }
        longer[p.length] = extra;
        vm.prank(founders[idx]);
        vm.expectRevert(OGPass.InvalidProof.selector);
        pass.claimFounder(longer);

        bytes32[] memory shorter = new bytes32[](p.length - 1);
        for (uint256 i; i < shorter.length; ++i) {
            shorter[i] = p[i];
        }
        vm.prank(founders[idx]);
        vm.expectRevert(OGPass.InvalidProof.selector);
        pass.claimFounder(shorter);

        // Reordered proof (swap first two elements) is also wrong.
        if (p.length >= 2) {
            (p[0], p[1]) = (p[1], p[0]);
            vm.prank(founders[idx]);
            vm.expectRevert(OGPass.InvalidProof.selector);
            pass.claimFounder(p);
        }
    }

    function testFuzz_everyFounderCanClaimInAnyOrder(uint256 seed) public {
        uint256[] memory order = new uint256[](FOUNDER_COUNT);
        for (uint256 i; i < FOUNDER_COUNT; ++i) {
            order[i] = i;
        }
        for (uint256 i = FOUNDER_COUNT - 1; i > 0; --i) {
            uint256 j = uint256(keccak256(abi.encode(seed, i))) % (i + 1);
            (order[i], order[j]) = (order[j], order[i]);
        }
        for (uint256 k; k < FOUNDER_COUNT; ++k) {
            uint256 id = claimAs(order[k]);
            assertEq(id, k + 1);
            assertTrue(pass.isFounder(id));
        }
        assertEq(pass.founderClaimed(), FOUNDER_COUNT);
        assertEq(pass.reservedFounderSlots(), 0);
    }

    function test_singleLeafTree_emptyProofIsValid() public {
        // With one founder the root is the leaf itself and the valid proof is empty.
        address solo = makeAddr("solo");
        OGPass p = new OGPass(address(og), Merkle.leafOf(solo), 1, owner);
        bytes32[] memory empty;
        // Anyone else with an empty proof is refused.
        vm.prank(publicActor(1));
        vm.expectRevert(OGPass.InvalidProof.selector);
        p.claimFounder(empty);
        vm.prank(solo);
        uint256 id = p.claimFounder(empty);
        assertTrue(p.isFounder(id));
        // The pass cannot be claimed twice even on a one-leaf tree, and once the single slot is taken the cap
        // check refuses everyone else before the proof is even looked at.
        vm.prank(solo);
        vm.expectRevert(OGPass.AlreadyClaimed.selector);
        p.claimFounder(empty);
        vm.prank(publicActor(1));
        vm.expectRevert(OGPass.FounderCapReached.selector);
        p.claimFounder(empty);
    }

    function test_zeroFounderCount_noClaimsAndFullPublicCap() public {
        OGPass p = new OGPass(address(og), root, 0, owner);
        vm.prank(founders[0]);
        vm.expectRevert(OGPass.FounderCapReached.selector);
        p.claimFounder(proofFor(0));
        assertEq(p.reservedFounderSlots(), 0);
        // All 1,000 slots are public from day one.
        for (uint256 i; i < MAX_SUPPLY; ++i) {
            address who = publicActor(i);
            uint256 price = p.currentBuyPrice();
            fund(who, price);
            vm.prank(who);
            og.approve(address(p), price);
            vm.prank(who);
            p.buy(price, block.timestamp);
        }
        assertEq(p.publicSupply(), MAX_SUPPLY);
        assertEq(p.curveReserve(), sumPrices(MAX_SUPPLY));
        address late = publicActor(7777);
        fund(late, p.currentBuyPrice());
        vm.prank(late);
        og.approve(address(p), type(uint256).max);
        vm.prank(late);
        vm.expectRevert(OGPass.SupplyCapReached.selector);
        p.buy(type(uint256).max, block.timestamp);
    }

    function test_founderCountEqualsCap_publicLockedOutUntilDeadline() public {
        OGPass p = new OGPass(address(og), root, MAX_SUPPLY, owner);
        assertEq(p.reservedFounderSlots(), MAX_SUPPLY);
        address alice = publicActor(1);
        fund(alice, BASE_PRICE);
        vm.prank(alice);
        og.approve(address(p), BASE_PRICE);
        vm.prank(alice);
        vm.expectRevert(OGPass.SupplyCapReached.selector);
        p.buy(BASE_PRICE, block.timestamp);
        vm.warp(p.claimDeadline());
        assertEq(p.reservedFounderSlots(), 0);
        vm.prank(alice);
        p.buy(BASE_PRICE, block.timestamp);
        assertEq(p.publicSupply(), 1);
    }

    // =============================================================================================
    // Duplicate exits and bad token ids
    // =============================================================================================

    function test_sellTwiceReverts() public {
        address alice = publicActor(1);
        uint256 id = buyAs(alice);
        sellAs(alice, id);
        vm.prank(alice);
        vm.expectRevert(OGPass.NotTokenOwner.selector);
        pass.sell(id, 0, block.timestamp);
        assertEq(pass.publicSupply(), 0);
        assertEq(pass.curveReserve(), 0);
    }

    function test_sellFounderTwiceReverts() public {
        uint256 id = claimAs(0);
        fundReserve(publicActor(3), 2 * FOUNDER_BUYBACK);
        vm.prank(founders[0]);
        pass.sellFounder(id);
        vm.prank(founders[0]);
        vm.expectRevert(OGPass.NotTokenOwner.selector);
        pass.sellFounder(id);
        assertEq(pass.founderReserve(), FOUNDER_BUYBACK);
        assertEq(pass.founderOutstanding(), 0);
    }

    function test_tokenIdZeroAndBurnedIdsRejectedEverywhere() public {
        address alice = publicActor(1);
        vm.prank(alice);
        vm.expectRevert(OGPass.NotTokenOwner.selector);
        pass.sell(0, 0, block.timestamp);
        vm.prank(alice);
        vm.expectRevert(OGPass.NotTokenOwner.selector);
        pass.sellFounder(0);
        assertFalse(pass.isFounder(0));

        uint256 id = claimAs(0);
        fundReserve(publicActor(3), FOUNDER_BUYBACK);
        vm.prank(founders[0]);
        pass.sellFounder(id);
        assertFalse(pass.isFounder(id));
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        pass.ownerOf(id);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        pass.tokenURI(id);
        // Token ids are never reused after a burn.
        uint256 next = buyAs(alice);
        assertEq(next, id + 1);
    }

    function test_sellDeadlineInclusiveAndFarFuture() public {
        address alice = publicActor(1);
        uint256 id = buyAs(alice);
        vm.prank(alice);
        pass.sell(id, 0, block.timestamp);
        uint256 id2 = buyAs(alice);
        vm.warp(block.timestamp + 1000 days);
        vm.prank(alice);
        pass.sell(id2, 0, type(uint256).max);
        assertEq(pass.publicSupply(), 0);
    }

    function test_buyWithZeroMaxPriceAlwaysReverts() public {
        address alice = publicActor(1);
        fund(alice, BASE_PRICE);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OGPass.PriceAboveMax.selector, BASE_PRICE, 0));
        pass.buy(0, block.timestamp);
    }

    function test_buyWithInsufficientBalanceButEnoughAllowanceReverts() public {
        address alice = publicActor(1);
        og.mint(alice, BASE_PRICE - 1);
        vm.prank(alice);
        og.approve(address(pass), type(uint256).max);
        vm.prank(alice);
        vm.expectRevert();
        pass.buy(BASE_PRICE, block.timestamp);
        assertEq(pass.publicSupply(), 0);
        assertEq(pass.curveReserve(), 0);
        assertFalse(pass.isMember(alice));
    }

    // =============================================================================================
    // Curve arithmetic at the edges and round trips
    // =============================================================================================

    function test_pricePins() public view {
        assertEq(pass.priceOf(1), 1_000_000e18);
        assertEq(pass.priceOf(2), 1_010_000e18);
        assertEq(pass.priceOf(951), 10_500_000e18);
        assertEq(pass.priceOf(1000), 10_990_000e18);
        assertEq(pass.FOUNDER_BUYBACK(), 100_000e18);
        assertEq(pass.SELL_BPS(), 9250);
        assertEq(pass.BPS(), 10_000);
        assertEq(pass.CLAIM_WINDOW(), 30 days);
    }

    function testFuzz_quotesMatchExecution(uint8 nRaw) public {
        // Preview equals actual: currentBuyPrice is exactly what buy pulls, currentSellPrice exactly what
        // sell pays, and the two together leave exactly 7.5% of the price at the burn address.
        uint256 n = bound(uint256(nRaw), 0, 60);
        for (uint256 i; i < n; ++i) {
            buyAs(publicActor(i));
        }
        address alice = publicActor(500);
        uint256 quotedBuy = pass.currentBuyPrice();
        assertEq(quotedBuy, priceOf(n + 1));
        fund(alice, quotedBuy);
        vm.prank(alice);
        uint256 id = pass.buy(quotedBuy, block.timestamp);
        assertEq(og.balanceOf(alice), 0);

        uint256 quotedSell = pass.currentSellPrice();
        assertEq(quotedSell, (quotedBuy * SELL_BPS) / BPS);
        uint256 deadBefore = og.balanceOf(DEAD);
        vm.prank(alice);
        uint256 got = pass.sell(id, quotedSell, block.timestamp);
        assertEq(got, quotedSell);
        assertEq(og.balanceOf(alice), quotedSell);
        assertLt(og.balanceOf(alice), quotedBuy, "round trip must not profit");
        assertEq(quotedBuy - og.balanceOf(alice), (quotedBuy * 750) / BPS);
        assertEq(og.balanceOf(DEAD) - deadBefore, quotedBuy - quotedSell);
        assertEq(pass.publicSupply(), n);
        assertEq(pass.curveReserve(), sumPrices(n));
    }

    function testFuzz_lateSellerNeverDrainsMoreThanReserveHolds(uint8 nRaw, uint8 sellsRaw) public {
        // Whatever order sells happen in, each payout plus burn equals exactly P(publicSupply) and the
        // reserve is always enough for the next one.
        uint256 n = bound(uint256(nRaw), 1, 50);
        uint256 sells = bound(uint256(sellsRaw), 1, n);
        uint256[] memory ids = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            ids[i] = buyAs(publicActor(i));
        }
        for (uint256 k; k < sells; ++k) {
            uint256 supply = pass.publicSupply();
            uint256 price = priceOf(supply);
            assertGe(pass.curveReserve(), price);
            uint256 before = og.balanceOf(address(pass));
            // the earliest buyer sells first: they paid the least and receive the most
            sellAs(publicActor(k), ids[k]);
            assertEq(before - og.balanceOf(address(pass)), price);
        }
        assertEq(pass.curveReserve(), sumPrices(n - sells));
    }

    // =============================================================================================
    // Full lifecycle at the cap: 951 public + 49 founders, then everything unwound to zero
    // =============================================================================================

    function test_fullCapLifecycleUnwindsToZero() public {
        uint256 publicMax = MAX_SUPPLY - FOUNDER_COUNT;
        uint256[] memory publicIds = new uint256[](publicMax);
        for (uint256 i; i < publicMax; ++i) {
            publicIds[i] = buyAs(publicActor(i));
        }
        uint256[] memory founderIds = new uint256[](FOUNDER_COUNT);
        for (uint256 i; i < FOUNDER_COUNT; ++i) {
            founderIds[i] = claimAs(i);
        }
        assertEq(pass.totalSupply(), MAX_SUPPLY);
        assertEq(pass.curveReserve(), sumPrices(publicMax));
        assertEq(pass.currentBuyPrice(), priceOf(publicMax + 1));

        // Past the deadline nothing opens up: the cap is made of outstanding passes only.
        vm.warp(pass.claimDeadline() + 1);
        address late = publicActor(9999);
        fund(late, pass.currentBuyPrice());
        vm.prank(late);
        vm.expectRevert(OGPass.SupplyCapReached.selector);
        pass.buy(type(uint256).max, block.timestamp);

        // Fund exactly what the founders need and burn nothing.
        fundReserve(publicActor(8888), FOUNDER_COUNT * FOUNDER_BUYBACK);
        vm.expectRevert(OGPass.NothingToBurn.selector);
        pass.burnUnclaimedFounderReserve();

        // Unwind public passes in a stride order (every 7th), founders interleaved every 20th public sell.
        uint256 totalPaid;
        uint256 totalBurned;
        uint256 stride = 7; // coprime with 951
        uint256 idx;
        uint256 f;
        for (uint256 k; k < publicMax; ++k) {
            uint256 supply = pass.publicSupply();
            uint256 price = priceOf(supply);
            uint256 payout = sellAs(publicActor(idx), publicIds[idx]);
            assertEq(payout, (price * SELL_BPS) / BPS);
            totalPaid += payout;
            totalBurned += price - payout;
            idx = (idx + stride) % publicMax;
            if (k % 20 == 0 && f < FOUNDER_COUNT) {
                vm.prank(founders[f]);
                pass.sellFounder(founderIds[f]);
                ++f;
            }
            assertEq(pass.curveReserve(), sumPrices(pass.publicSupply()));
        }
        for (; f < FOUNDER_COUNT; ++f) {
            vm.prank(founders[f]);
            pass.sellFounder(founderIds[f]);
        }
        assertEq(pass.publicSupply(), 0);
        assertEq(pass.founderOutstanding(), 0);
        assertEq(pass.totalSupply(), 0);
        assertEq(pass.curveReserve(), 0);
        assertEq(pass.founderReserve(), 0);
        assertEq(og.balanceOf(address(pass)), 0);
        assertEq(totalPaid + totalBurned, sumPrices(publicMax));
        assertEq(og.balanceOf(DEAD), totalBurned);
        assertEq(totalBurned, (sumPrices(publicMax) * 750) / BPS);
        for (uint256 i; i < FOUNDER_COUNT; ++i) {
            assertEq(og.balanceOf(founders[i]), FOUNDER_BUYBACK);
        }
        // The curve restarts from P(1) and the wallets are free again.
        assertEq(pass.currentBuyPrice(), BASE_PRICE);
        assertEq(buyAs(publicActor(0)), MAX_SUPPLY + 1);
    }

    function test_publicFillsAllThousandAfterDeadlineWhenNoFounderClaims() public {
        vm.warp(pass.claimDeadline());
        for (uint256 i; i < MAX_SUPPLY; ++i) {
            buyAs(publicActor(i));
        }
        assertEq(pass.publicSupply(), MAX_SUPPLY);
        assertEq(pass.curveReserve(), sumPrices(MAX_SUPPLY));
        assertEq(pass.currentSellPrice(), (priceOf(MAX_SUPPLY) * SELL_BPS) / BPS);
        address late = publicActor(9999);
        fund(late, pass.currentBuyPrice());
        vm.prank(late);
        vm.expectRevert(OGPass.SupplyCapReached.selector);
        pass.buy(type(uint256).max, block.timestamp);
        // LIFO unwind
        for (uint256 i = MAX_SUPPLY; i > 0; --i) {
            sellAs(publicActor(i - 1), i);
        }
        assertEq(pass.curveReserve(), 0);
        assertEq(og.balanceOf(address(pass)), 0);
    }

    // =============================================================================================
    // Founder reserve accounting under interleaving
    // =============================================================================================

    function testFuzz_burnKeepsExactlyWhatOutstandingFoundersNeed(uint8 claimedRaw, uint256 funded, uint8 lateSells)
        public
    {
        uint256 claimed = bound(uint256(claimedRaw), 1, FOUNDER_COUNT);
        funded = bound(funded, claimed * FOUNDER_BUYBACK + 1, 50_000_000e18);
        for (uint256 i; i < claimed; ++i) {
            claimAs(i);
        }
        fundReserve(publicActor(3), funded);
        vm.warp(pass.claimDeadline());
        uint256 burned = pass.burnUnclaimedFounderReserve();
        assertEq(burned, funded - claimed * FOUNDER_BUYBACK);
        assertEq(pass.founderReserve(), claimed * FOUNDER_BUYBACK);

        // After the burn, the reserve is exactly enough: every founder exits and the last one empties it.
        uint256 sells = bound(uint256(lateSells), 0, claimed);
        for (uint256 i; i < sells; ++i) {
            vm.prank(founders[i]);
            pass.sellFounder(i + 1);
            assertEq(pass.founderReserve(), (claimed - i - 1) * FOUNDER_BUYBACK);
        }
        // Nothing more to burn while the remaining founders are exactly covered.
        vm.expectRevert(OGPass.NothingToBurn.selector);
        pass.burnUnclaimedFounderReserve();
        assertEq(og.balanceOf(address(pass)), pass.founderReserve());
    }

    function test_founderClaimAfterBurnStillImpossibleEvenWithReserveLeft() public {
        // Deadline passed, reserve burned down to what two founders need; a third founder is locked out and
        // cannot make the reserve short.
        claimAs(0);
        claimAs(1);
        fundReserve(publicActor(3), 1_000_000e18);
        vm.warp(pass.claimDeadline());
        pass.burnUnclaimedFounderReserve();
        vm.prank(founders[2]);
        vm.expectRevert(OGPass.ClaimClosed.selector);
        pass.claimFounder(proofFor(2));
        assertEq(pass.founderReserve(), 2 * FOUNDER_BUYBACK);
    }

    function test_reserveFundedEventReportsRunningTotal() public {
        address donor = publicActor(5);
        fund(donor, 3e18);
        vm.startPrank(donor);
        vm.expectEmit(true, false, false, true, address(pass));
        emit OGPass.ReserveFunded(donor, 1e18, 1e18);
        pass.fundFounderReserve(1e18);
        vm.expectEmit(true, false, false, true, address(pass));
        emit OGPass.ReserveFunded(donor, 2e18, 3e18);
        pass.fundFounderReserve(2e18);
        vm.stopPrank();
        assertEq(pass.founderReserve(), 3e18);
    }
}
