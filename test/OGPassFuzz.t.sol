// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OGPassBase} from "./OGPassBase.sol";
import {OGPass} from "../src/OGPass.sol";

/// @notice Property tests over random buy/sell/claim/buyback sequences.
contract OGPassFuzzTest is OGPassBase {
    uint256 internal constant ACTORS = 16;

    // Per-actor outstanding public token id (0 = none).
    mapping(uint256 => uint256) internal publicToken;
    // Per-founder outstanding founder token id (0 = none).
    mapping(uint256 => uint256) internal founderToken;

    uint256 internal expectedDead;

    function _rand(uint256 seed, uint256 i, uint256 salt) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, i, salt)));
    }

    function _checkAccounting() internal view {
        assertEq(pass.curveReserve(), sumPrices(pass.publicSupply()), "curve reserve != sum of prices");
        assertEq(og.balanceOf(address(pass)), pass.curveReserve() + pass.founderReserve(), "balance != reserves");
        assertEq(og.balanceOf(DEAD), expectedDead, "burn address drift");
        assertLe(pass.totalSupply(), MAX_SUPPLY, "cap");
        assertLe(pass.founderOutstanding(), pass.founderClaimed(), "founder outstanding");
        assertLe(pass.founderClaimed(), FOUNDER_COUNT, "founder claimed");
    }

    /// @dev Random interleaving of buys, sells, founder claims, founder buybacks and reserve funding.
    ///      After every step the curve reserve equals the sum of outstanding prices and the contract
    ///      balance equals the two reserves. At the end everything is sold and the curve is empty.
    function testFuzz_randomSequencePreservesInvariants(uint256 seed, uint8 stepsRaw) public {
        uint256 steps = bound(uint256(stepsRaw), 1, 120);
        for (uint256 i; i < steps; ++i) {
            uint256 action = _rand(seed, i, 0) % 10;
            if (action < 4) {
                _tryBuy(_rand(seed, i, 1) % ACTORS);
            } else if (action < 7) {
                _trySell(_rand(seed, i, 2) % ACTORS);
            } else if (action == 7) {
                _tryClaim(_rand(seed, i, 3) % FOUNDER_COUNT);
            } else if (action == 8) {
                _tryFounderSell(_rand(seed, i, 4) % FOUNDER_COUNT);
            } else {
                fundReserve(publicActor(ACTORS + 1), (_rand(seed, i, 5) % 300_000e18) + 1);
            }
            _checkAccounting();
        }

        // Unwind every public pass in a seed-dependent order.
        uint256 start = _rand(seed, 0, 9) % ACTORS;
        for (uint256 k; k < ACTORS; ++k) {
            uint256 a = (start + k) % ACTORS;
            if (publicToken[a] != 0) {
                _trySell(a);
                _checkAccounting();
            }
        }
        assertEq(pass.publicSupply(), 0);
        assertEq(pass.curveReserve(), 0);
        assertEq(og.balanceOf(address(pass)), pass.founderReserve());
    }

    /// @dev Buy n passes, sell them in a seed-derived permutation; reserve and balance end at zero.
    function testFuzz_anySellOrderEmptiesCurve(uint8 nRaw, uint256 seed) public {
        uint256 n = bound(uint256(nRaw), 1, 40);
        uint256[] memory ids = new uint256[](n);
        address[] memory who = new address[](n);
        uint256 paid;
        for (uint256 i; i < n; ++i) {
            who[i] = publicActor(100 + i);
            paid += pass.currentBuyPrice();
            ids[i] = buyAs(who[i]);
        }
        assertEq(pass.curveReserve(), paid);
        assertEq(paid, sumPrices(n));

        // Fisher-Yates shuffle of indices from the seed.
        uint256[] memory order = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            order[i] = i;
        }
        for (uint256 i = n - 1; i > 0; --i) {
            uint256 j = _rand(seed, i, 77) % (i + 1);
            (order[i], order[j]) = (order[j], order[i]);
        }

        uint256 received;
        uint256 burned;
        for (uint256 k; k < n; ++k) {
            uint256 i = order[k];
            uint256 supplyBefore = pass.publicSupply();
            uint256 price = priceOf(supplyBefore);
            uint256 payout = sellAs(who[i], ids[i]);
            assertEq(payout, (price * 9250) / 10_000);
            received += payout;
            burned += price - payout;
            assertEq(pass.curveReserve(), sumPrices(pass.publicSupply()));
        }
        assertEq(pass.curveReserve(), 0);
        assertEq(og.balanceOf(address(pass)), 0);
        assertEq(received + burned, paid);
        assertEq(og.balanceOf(DEAD), burned);
    }

    function testFuzz_buyRespectsMaxPrice(uint256 maxPrice) public {
        address alice = publicActor(1);
        fund(alice, BASE_PRICE);
        vm.prank(alice);
        if (maxPrice < BASE_PRICE) {
            vm.expectRevert(abi.encodeWithSelector(OGPass.PriceAboveMax.selector, BASE_PRICE, maxPrice));
            pass.buy(maxPrice, block.timestamp);
        } else {
            pass.buy(maxPrice, block.timestamp);
            assertEq(og.balanceOf(alice), 0);
        }
    }

    function testFuzz_sellRespectsMinOut(uint256 minOut) public {
        address alice = publicActor(1);
        uint256 id = buyAs(alice);
        uint256 payout = (BASE_PRICE * 9250) / 10_000;
        vm.prank(alice);
        if (minOut > payout) {
            vm.expectRevert(abi.encodeWithSelector(OGPass.PayoutBelowMin.selector, payout, minOut));
            pass.sell(id, minOut, block.timestamp);
        } else {
            assertEq(pass.sell(id, minOut, block.timestamp), payout);
        }
    }

    function testFuzz_deadlines(uint256 deadline) public {
        address alice = publicActor(1);
        fund(alice, BASE_PRICE);
        vm.prank(alice);
        if (deadline < block.timestamp) {
            vm.expectRevert(OGPass.Expired.selector);
            pass.buy(BASE_PRICE, deadline);
        } else {
            uint256 id = pass.buy(BASE_PRICE, deadline);
            vm.prank(alice);
            pass.sell(id, 0, deadline);
        }
    }

    function testFuzz_claimWindow(uint256 offset) public {
        offset = bound(offset, 0, 400 days);
        vm.warp(deployTime + offset);
        uint256 deadline = pass.claimDeadline();
        vm.prank(founders[0]);
        if (deployTime + offset >= deadline) {
            vm.expectRevert(OGPass.ClaimClosed.selector);
            pass.claimFounder(proofFor(0));
        } else {
            pass.claimFounder(proofFor(0));
            assertTrue(pass.isFounder(1));
        }
    }

    function testFuzz_strangerCannotClaimWithAnyFounderProof(address stranger, uint8 idx) public {
        uint256 i = uint256(idx) % FOUNDER_COUNT;
        vm.assume(stranger != founders[i] && stranger != address(0));
        vm.prank(stranger);
        vm.expectRevert(OGPass.InvalidProof.selector);
        pass.claimFounder(proofFor(i));
    }

    function testFuzz_burnUnclaimedMath(uint8 claimedRaw, uint8 soldRaw, uint256 funded) public {
        uint256 claimed = bound(uint256(claimedRaw), 0, FOUNDER_COUNT);
        uint256 sold = bound(uint256(soldRaw), 0, claimed);
        funded = bound(funded, 1, 20_000_000e18);
        for (uint256 i; i < claimed; ++i) {
            claimAs(i);
        }
        fundReserve(publicActor(3), funded);
        uint256 reserve = funded;
        for (uint256 i; i < sold; ++i) {
            if (reserve < FOUNDER_BUYBACK) break;
            vm.prank(founders[i]);
            pass.sellFounder(i + 1);
            reserve -= FOUNDER_BUYBACK;
        }
        uint256 needed = pass.founderOutstanding() * FOUNDER_BUYBACK;
        vm.warp(pass.claimDeadline() + 1);
        if (reserve > needed) {
            uint256 burned = pass.burnUnclaimedFounderReserve();
            assertEq(burned, reserve - needed);
            assertEq(pass.founderReserve(), needed);
            assertEq(og.balanceOf(DEAD), burned);
        } else {
            vm.expectRevert(OGPass.NothingToBurn.selector);
            pass.burnUnclaimedFounderReserve();
            assertEq(pass.founderReserve(), reserve);
        }
        // Remaining founders are always paid in full when the reserve covers them.
        uint256 outstanding = pass.founderOutstanding();
        if (pass.founderReserve() >= outstanding * FOUNDER_BUYBACK) {
            for (uint256 i; i < claimed; ++i) {
                if (pass.isFounder(i + 1)) {
                    vm.prank(founders[i]);
                    pass.sellFounder(i + 1);
                }
            }
            assertEq(pass.founderOutstanding(), 0);
        }
    }

    // --- step helpers ---------------------------------------------------------------------------

    function _tryBuy(uint256 a) internal {
        address who = publicActor(a);
        if (pass.isMember(who)) return;
        if (pass.publicSupply() + pass.founderOutstanding() + pass.reservedFounderSlots() >= MAX_SUPPLY) return;
        publicToken[a] = buyAs(who);
    }

    function _trySell(uint256 a) internal {
        uint256 id = publicToken[a];
        if (id == 0) return;
        uint256 price = priceOf(pass.publicSupply());
        uint256 payout = (price * 9250) / 10_000;
        expectedDead += price - payout;
        uint256 got = sellAs(publicActor(a), id);
        assertEq(got, payout);
        publicToken[a] = 0;
    }

    function _tryClaim(uint256 f) internal {
        if (pass.hasClaimedFounder(founders[f])) return;
        founderToken[f] = claimAs(f);
    }

    function _tryFounderSell(uint256 f) internal {
        uint256 id = founderToken[f];
        if (id == 0) return;
        if (pass.founderReserve() < FOUNDER_BUYBACK) return;
        uint256 before = og.balanceOf(founders[f]);
        vm.prank(founders[f]);
        pass.sellFounder(id);
        assertEq(og.balanceOf(founders[f]) - before, FOUNDER_BUYBACK);
        founderToken[f] = 0;
    }
}
