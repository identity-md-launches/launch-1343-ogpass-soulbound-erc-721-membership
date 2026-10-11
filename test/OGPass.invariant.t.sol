// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {OGPass} from "../src/OGPass.sol";
import {MockOG} from "./mocks/MockOG.sol";
import {Merkle} from "./helpers/Merkle.sol";

/// @notice Drives the pass with bounded, non-reverting calls so `fail_on_revert = true` stays meaningful.
contract OGPassHandler is Test {
    uint256 public constant ACTORS = 24;
    uint256 public constant FOUNDER_BUYBACK = 100_000e18;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    OGPass public pass;
    MockOG public og;
    address public owner;
    address[] public founders;
    bytes32[] public leaves;

    mapping(address => uint256) public tokenOf;
    uint256 public ghostBurned;
    uint256 public ghostPaidToSellers;
    uint256 public ghostPaidToFounders;
    uint256 public ghostDeposited;
    uint256 public calls;

    constructor(OGPass pass_, MockOG og_, address owner_, address[] memory founders_, bytes32[] memory leaves_) {
        pass = pass_;
        og = og_;
        owner = owner_;
        founders = founders_;
        leaves = leaves_;
    }

    function actor(uint256 i) public pure returns (address) {
        return address(uint160(0xA000 + (i % ACTORS)));
    }

    function buy(uint256 a) external {
        calls++;
        address who = actor(a);
        if (pass.buysPaused() || pass.isMember(who)) return;
        if (pass.publicSupply() + pass.founderOutstanding() + pass.reservedFounderSlots() >= pass.MAX_SUPPLY()) return;
        uint256 price = pass.currentBuyPrice();
        og.mint(who, price);
        vm.startPrank(who);
        og.approve(address(pass), price);
        tokenOf[who] = pass.buy(price, block.timestamp);
        vm.stopPrank();
        ghostDeposited += price;
    }

    function sell(uint256 a) external {
        calls++;
        address who = actor(a);
        uint256 id = tokenOf[who];
        if (id == 0) return;
        uint256 price = pass.priceOf(pass.publicSupply());
        uint256 payout = (price * pass.SELL_BPS()) / pass.BPS();
        vm.prank(who);
        uint256 got = pass.sell(id, payout, block.timestamp);
        tokenOf[who] = 0;
        ghostPaidToSellers += got;
        ghostBurned += price - got;
    }

    function claim(uint256 f) external {
        calls++;
        f %= founders.length;
        address who = founders[f];
        if (block.timestamp >= pass.claimDeadline()) return;
        if (pass.hasClaimedFounder(who) || pass.isMember(who)) return;
        vm.prank(who);
        tokenOf[who] = pass.claimFounder(Merkle.proof(leaves, f));
    }

    function sellFounder(uint256 f) external {
        calls++;
        f %= founders.length;
        address who = founders[f];
        uint256 id = tokenOf[who];
        if (id == 0 || !pass.isFounder(id)) return;
        if (pass.founderReserve() < FOUNDER_BUYBACK) return;
        vm.prank(who);
        pass.sellFounder(id);
        tokenOf[who] = 0;
        ghostPaidToFounders += FOUNDER_BUYBACK;
    }

    function fundReserve(uint256 amount) external {
        calls++;
        amount = bound(amount, 1, 500_000e18);
        address who = address(0xF00D);
        og.mint(who, amount);
        vm.startPrank(who);
        og.approve(address(pass), amount);
        pass.fundFounderReserve(amount);
        vm.stopPrank();
        ghostDeposited += amount;
    }

    function burnUnclaimed() external {
        calls++;
        if (block.timestamp < pass.claimDeadline()) return;
        uint256 needed = pass.founderOutstanding() * FOUNDER_BUYBACK;
        if (pass.founderReserve() <= needed) return;
        uint256 burned = pass.burnUnclaimedFounderReserve();
        ghostBurned += burned;
    }

    function warp(uint256 delta) external {
        calls++;
        delta = bound(delta, 1, 5 days);
        vm.warp(block.timestamp + delta);
    }

    function togglePause() external {
        calls++;
        bool next = !pass.buysPaused();
        vm.prank(owner);
        pass.setBuysPaused(next);
    }
}

contract OGPassInvariantTest is StdInvariant, Test {
    uint256 internal constant FOUNDER_COUNT = 49;
    uint256 internal constant BASE_PRICE = 1_000_000e18;
    uint256 internal constant PRICE_STEP = 10_000e18;

    MockOG internal og;
    OGPass internal pass;
    OGPassHandler internal handler;
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
        handler = new OGPassHandler(pass, og, owner, founders, leaves);

        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](8);
        selectors[0] = handler.buy.selector;
        selectors[1] = handler.sell.selector;
        selectors[2] = handler.claim.selector;
        selectors[3] = handler.sellFounder.selector;
        selectors[4] = handler.fundReserve.selector;
        selectors[5] = handler.burnUnclaimed.selector;
        selectors[6] = handler.warp.selector;
        selectors[7] = handler.togglePause.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function sumPrices(uint256 n) internal pure returns (uint256) {
        return n * BASE_PRICE + (PRICE_STEP * n * (n > 0 ? n - 1 : 0)) / 2;
    }

    function invariant_curveReserveEqualsSumOfOutstandingPrices() public view {
        assertEq(pass.curveReserve(), sumPrices(pass.publicSupply()));
    }

    function invariant_solvent() public view {
        assertEq(og.balanceOf(address(pass)), pass.curveReserve() + pass.founderReserve());
    }

    function invariant_conservation() public view {
        assertEq(
            handler.ghostDeposited(),
            og.balanceOf(address(pass)) + handler.ghostPaidToSellers() + handler.ghostPaidToFounders()
                + handler.ghostBurned()
        );
        assertEq(og.balanceOf(handler.DEAD()), handler.ghostBurned());
    }

    function invariant_supplyCapAndFounderCounts() public view {
        assertLe(pass.totalSupply() + pass.reservedFounderSlots(), pass.MAX_SUPPLY());
        assertLe(pass.founderOutstanding(), pass.founderClaimed());
        assertLe(pass.founderClaimed(), FOUNDER_COUNT);
    }

    function invariant_onePassPerWallet() public view {
        for (uint256 i; i < handler.ACTORS(); ++i) {
            assertLe(pass.balanceOf(handler.actor(i)), 1);
        }
        for (uint256 i; i < FOUNDER_COUNT; ++i) {
            assertLe(pass.balanceOf(founders[i]), 1);
        }
    }

    function invariant_founderReserveNeverExceedsBalance() public view {
        // The founder reserve is backed by real OG and is never used by the curve.
        assertLe(pass.founderReserve(), og.balanceOf(address(pass)));
        assertLe(pass.curveReserve(), og.balanceOf(address(pass)));
    }
}
