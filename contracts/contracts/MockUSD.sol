// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet-only demo token with no monetary value or redemption rights.
contract MockUSD is ERC20, Ownable {
    uint8 public constant DECIMALS = 6;

    constructor(address initialIssuer) ERC20("MockUSD Test Token", "MUSD") Ownable(initialIssuer) {}

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function mint(address recipient, uint256 amount) external onlyOwner {
        _mint(recipient, amount);
    }
}
