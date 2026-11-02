// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ICroakQuest {
    function bet(uint256 _amount) external;
    function accumulatedFunds() external view returns (uint256);
}

contract ReentrantERC20 is ERC20 {
    address public croakQuestAddress;
    bool public attemptReentrancy;
    bool public reentrancyAttempted;
    bool public reentrancyFailed;
    uint256 public accumulatedFundsAtTransfer;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function setCroakQuestAddress(address _croakQuestAddress) external {
        croakQuestAddress = _croakQuestAddress;
    }

    function setAttemptReentrancy(bool _attempt) external {
        attemptReentrancy = _attempt;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        if (attemptReentrancy && recipient != croakQuestAddress && croakQuestAddress != address(0)) {
            reentrancyAttempted = true;
            accumulatedFundsAtTransfer = ICroakQuest(croakQuestAddress).accumulatedFunds();

            // Attempt reentrancy into bet
            try ICroakQuest(croakQuestAddress).bet(10) {
                // Should not reach here if nonReentrant works
            } catch {
                reentrancyFailed = true;
            }
        }
        return super.transfer(recipient, amount);
    }
}
