// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "../swap/DexKIP7.sol";

contract DexKIP7Test is DexKIP7 {
    constructor(uint _totalSupply, string memory _name, string memory _symbol) DexKIP7(_name, _symbol) {
        _mint(msg.sender, _totalSupply);
    }
}