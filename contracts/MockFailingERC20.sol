// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockFailingERC20 is ERC20 {
    bool public failTransferFrom;
    bool public failTransfer;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function setFailTransferFrom(bool _fail) external {
        failTransferFrom = _fail;
    }

    function setFailTransfer(bool _fail) external {
        failTransfer = _fail;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        if (failTransferFrom) {
            return false;
        }
        return super.transferFrom(sender, recipient, amount);
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        if (failTransfer) {
            return false;
        }
        return super.transfer(recipient, amount);
    }
}
