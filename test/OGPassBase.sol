// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OGPass} from "../src/OGPass.sol";
import {MockOG} from "./mocks/MockOG.sol";
import {Merkle} from "./helpers/Merkle.sol";

/// @notice Shared fixture: a mock OG token, 49 founder addresses with a Merkle tree, and a deployed pass.
abstract contract OGPassBase is Test {
    uint256 internal constant FOUNDER_COUNT = 49;
    uint256 internal constant MAX_SUPPLY = 1000;
    uint256 internal constant BASE_PRICE = 1_000_000e18;
    uint256 internal constant PRICE_STEP = 10_000e18;
    uint256 internal constant FOUNDER_BUYBACK = 100_000e18;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    MockOG internal og;
    OGPass internal pass;
    address internal owner = makeAddr("owner");
    address[] internal founders;
    bytes32[] internal leaves;
    bytes32 internal root;
    uint256 internal deployTime;

    function setUp() public virtual {
        // Start from a non-trivial timestamp so deadline arithmetic is not tested against 1.
        vm.warp(1_760_000_000);
        og = new MockOG();
        for (uint256 i; i < FOUNDER_COUNT; ++i) {
            founders.push(makeAddr(string.concat("founder", vm.toString(i))));
        }
        leaves = Merkle.leavesOf(founders);
        root = Merkle.root(leaves);
        deployTime = block.timestamp;
        pass = new OGPass(address(og), root, FOUNDER_COUNT, owner);
    }

    // --- helpers -------------------------------------------------------------------------------

    function proofFor(uint256 i) internal view returns (bytes32[] memory) {
        return Merkle.proof(leaves, i);
    }

    function claimAs(uint256 i) internal returns (uint256 tokenId) {
        vm.prank(founders[i]);
        tokenId = pass.claimFounder(proofFor(i));
    }

    function fund(address who, uint256 amount) internal {
        og.mint(who, amount);
        vm.prank(who);
        og.approve(address(pass), amount);
    }

    function buyAs(address who) internal returns (uint256 tokenId) {
        uint256 price = pass.currentBuyPrice();
        fund(who, price);
        vm.prank(who);
        tokenId = pass.buy(price, block.timestamp);
    }

    function sellAs(address who, uint256 tokenId) internal returns (uint256 payout) {
        vm.prank(who);
        payout = pass.sell(tokenId, 0, block.timestamp);
    }

    function fundReserve(address who, uint256 amount) internal {
        fund(who, amount);
        vm.prank(who);
        pass.fundFounderReserve(amount);
    }

    function priceOf(uint256 n) internal pure returns (uint256) {
        return BASE_PRICE + PRICE_STEP * (n - 1);
    }

    function sumPrices(uint256 n) internal pure returns (uint256) {
        return n * BASE_PRICE + (PRICE_STEP * n * (n > 0 ? n - 1 : 0)) / 2;
    }

    function publicActor(uint256 i) internal returns (address) {
        return makeAddr(string.concat("public", vm.toString(i)));
    }
}
