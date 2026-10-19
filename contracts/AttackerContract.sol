// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./CroakQuestEfrogsJourney.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AttackerContract {
    CroakQuestEfrogsJourney public game;
    IERC20 public token;

    constructor(address _game, address _token) {
        game = CroakQuestEfrogsJourney(_game);
        token = IERC20(_token);
    }

    function attemptSameBlockExploit(uint256 amount) external {
        token.approve(address(game), amount);
        uint256 requestId = game.bet(amount);

        // Attempt to inspect if the bet was resolved in the same block
        (address player, uint256 betAmount, , bool resolved) = game.s_pendingBets(requestId);

        // Bet must NOT be resolved in the same block
        require(!resolved, "Bet should not be resolved in the same block");
        require(player == address(this), "Player should be this contract");
        require(betAmount == amount, "Bet amount mismatch");
    }
}
