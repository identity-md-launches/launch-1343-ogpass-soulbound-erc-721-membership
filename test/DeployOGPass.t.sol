// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {DeployOGPass} from "../script/DeployOGPass.s.sol";
import {OGPass} from "../src/OGPass.sol";

/// @notice Exercises the deployment configuration directly, without broadcasting or reading the environment.
contract DeployOGPassTest is Test {
    DeployOGPass internal script;

    function setUp() public {
        vm.warp(1_760_123_456);
        script = new DeployOGPass();
    }

    function test_mainnetConfigMatchesBrief() public view {
        DeployOGPass.Config memory cfg = script.mainnetConfig();
        assertEq(cfg.og, 0xCe7EB1Ad9e2E1c784ea05F7eA4A0Fe625923D10A);
        assertEq(cfg.founderRoot, 0xb9c8ed1655d96a99d756f50819afd0c008b1097497edba9ee4fdb1b7ce2dc6c8);
        assertEq(cfg.founderCount, 49);
        assertEq(cfg.owner, 0x5b95A971B4583A5f011E9DA082acdD679b870D06);
    }

    function test_deployOnEmptyChain() public {
        // The OG address has no code here, exactly like the launch rehearsal; the constructor must not care.
        DeployOGPass.Config memory cfg = script.mainnetConfig();
        assertEq(cfg.og.code.length, 0);
        OGPass pass = script.deploy(cfg);

        assertEq(address(pass.OG()), cfg.og);
        assertEq(pass.founderRoot(), cfg.founderRoot);
        assertEq(pass.founderCount(), 49);
        assertEq(pass.owner(), cfg.owner);
        assertEq(pass.claimDeadline(), block.timestamp + 30 days);
        assertEq(pass.name(), "OG Pass");
        assertEq(pass.symbol(), "OGPASS");
        assertEq(pass.MAX_SUPPLY(), 1000);
        assertEq(pass.BASE_PRICE(), 1_000_000e18);
        assertEq(pass.PRICE_STEP(), 10_000e18);
        assertEq(pass.FOUNDER_BUYBACK(), 100_000e18);
        assertEq(pass.SELL_BPS(), 9250);
    }

    function test_runtimeFitsEip170() public {
        OGPass pass = script.deploy(script.mainnetConfig());
        assertLe(address(pass).code.length, 24_576);
    }
}
