// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Minimal Merkle tree builder compatible with OpenZeppelin's MerkleProof (sorted-pair hashing).
///         An odd node at any level is carried up unchanged. Leaves follow the OpenZeppelin standard
///         tree encoding: keccak256(bytes.concat(keccak256(abi.encode(address)))).
library Merkle {
    function leafOf(address account) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account))));
    }

    function leavesOf(address[] memory accounts) internal pure returns (bytes32[] memory leaves) {
        leaves = new bytes32[](accounts.length);
        for (uint256 i; i < accounts.length; ++i) {
            leaves[i] = leafOf(accounts[i]);
        }
    }

    function hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function root(bytes32[] memory leaves) internal pure returns (bytes32) {
        require(leaves.length > 0, "empty");
        bytes32[] memory level = leaves;
        while (level.length > 1) {
            level = _nextLevel(level);
        }
        return level[0];
    }

    function proof(bytes32[] memory leaves, uint256 index) internal pure returns (bytes32[] memory out) {
        require(index < leaves.length, "index");
        bytes32[] memory scratch = new bytes32[](leaves.length);
        uint256 count;
        bytes32[] memory level = leaves;
        uint256 idx = index;
        while (level.length > 1) {
            uint256 sibling = idx ^ 1;
            if (sibling < level.length) {
                scratch[count++] = level[sibling];
            }
            level = _nextLevel(level);
            idx /= 2;
        }
        out = new bytes32[](count);
        for (uint256 i; i < count; ++i) {
            out[i] = scratch[i];
        }
    }

    function _nextLevel(bytes32[] memory level) private pure returns (bytes32[] memory next) {
        uint256 n = (level.length + 1) / 2;
        next = new bytes32[](n);
        for (uint256 i; i < n; ++i) {
            uint256 l = 2 * i;
            uint256 r = l + 1;
            next[i] = r < level.length ? hashPair(level[l], level[r]) : level[l];
        }
    }
}
