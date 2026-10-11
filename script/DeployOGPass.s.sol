// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {OGPass} from "../src/OGPass.sol";

/// @notice Reviewable deployment reference for Ethereum mainnet. The launch itself deploys the
///         contract from its built bytecode with the same constructor arguments; this script exists
///         so the parameters live in one place and can be exercised by tests.
contract DeployOGPass is Script {
    struct Config {
        address og;
        bytes32 founderRoot;
        uint256 founderCount;
        address owner;
    }

    /// @notice Existing OG ERC-20 on Ethereum mainnet (18 decimals, no transfer fee).
    address public constant OG_TOKEN = 0xCe7EB1Ad9e2E1c784ea05F7eA4A0Fe625923D10A;

    /// @notice Merkle root of the 49 founder addresses supplied by the requester.
    bytes32 public constant FOUNDER_ROOT = 0xb9c8ed1655d96a99d756f50819afd0c008b1097497edba9ee4fdb1b7ce2dc6c8;

    /// @notice Number of founder slots reserved inside the 1,000-pass cap.
    uint256 public constant FOUNDER_COUNT = 49;

    /// @notice Owner named by the launch request ($owner).
    address public constant OWNER = 0x5b95A971B4583A5f011E9DA082acdD679b870D06;

    function mainnetConfig() public pure returns (Config memory) {
        return Config({og: OG_TOKEN, founderRoot: FOUNDER_ROOT, founderCount: FOUNDER_COUNT, owner: OWNER});
    }

    function deploy(Config memory cfg) public returns (OGPass pass) {
        pass = new OGPass(cfg.og, cfg.founderRoot, cfg.founderCount, cfg.owner);
    }

    function run() external returns (OGPass pass) {
        vm.startBroadcast();
        pass = deploy(mainnetConfig());
        vm.stopBroadcast();
    }
}
