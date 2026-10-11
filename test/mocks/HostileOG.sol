// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @notice ERC-20 that delivers one wei MORE than requested on every transferFrom (a "bonus" or
///         positively rebasing token). The pass must reject it: the received amount is not the requested one.
contract OverDeliverOG is ERC20 {
    constructor() ERC20("Bonus OG", "BOG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        bool ok = super.transferFrom(from, to, value);
        _mint(to, 1);
        return ok;
    }
}

/// @notice ERC-20 whose transferFrom silently returns false without moving anything. SafeERC20 must revert.
contract FalseReturnOG is ERC20 {
    constructor() ERC20("False OG", "FOG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

/// @notice USDT-style ERC-20: transfer and transferFrom return nothing at all. SafeERC20 must accept it.
contract NoReturnOG {
    string public constant name = "NoReturn OG";
    string public constant symbol = "NOG";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external {
        _move(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @notice A contract wallet that happily accepts ERC-721 tokens. Used to show the soulbound check fires before
///         any receiver hook could run.
contract WelcomingReceiver is IERC721Receiver {
    uint256 public received;

    function onERC721Received(address, address, uint256, bytes calldata) external override returns (bytes4) {
        received++;
        return IERC721Receiver.onERC721Received.selector;
    }
}
