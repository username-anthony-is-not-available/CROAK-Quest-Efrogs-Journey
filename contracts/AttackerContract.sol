// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./CroakQuestEfrogsJourney.sol";

/**
 * @title AttackerContract
 * @dev Simulates an attacker contract attempting to play CROAK Quest and query or revert
 * the outcome in the same transaction/block.
 */
contract AttackerContract {
    CroakQuestEfrogsJourney public immutable game;
    IERC20 public immutable token;

    constructor(address _gameAddress, address _tokenAddress) {
        game = CroakQuestEfrogsJourney(_gameAddress);
        token = IERC20(_tokenAddress);
    }

    /**
     * @dev Attempts to bet and immediately determine whether the bet won in the same transaction.
     * Since Chainlink VRF decouples randomness request and fulfillment across separate blocks/transactions,
     * the balance does not increase immediately, pending request remains unresolved, and the attacker
     * cannot conditionally revert losing bets.
     */
    function attackBet(uint256 amount) external returns (bool outcomeResolvedInSameBlock) {
        uint256 balanceBefore = token.balanceOf(address(this));
        token.approve(address(game), amount);

        game.bet(amount);

        uint256 balanceAfter = token.balanceOf(address(this));

        // If outcome could be resolved synchronously in the same block, balance would either increase (win)
        // or decrease (loss). In VRF, the bet is pending and balance has decreased by amount.
        outcomeResolvedInSameBlock = (balanceAfter > balanceBefore);

        // If an attacker attempts to revert if not winning immediately:
        if (!outcomeResolvedInSameBlock) {
            // Outcome is not resolved yet in the same block!
            return false;
        }

        return true;
    }
}
