// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CroakQuestEfrogsJourney is Ownable {
    IERC20 public token;
    IERC721 public nftCollection;
    uint256 public accumulatedFunds;
    uint8 public winChance = 5; // Default 5% chance to win
    uint8 public winPercentage = 5; // Default 5% of accumulated funds as additional winnings
    uint8 public nftBonusPercentage = 5; // Additional 5% bonus for NFT holders

    event Bet(address indexed player, uint256 amount, bool won, bool nftBonus);
    event FundsAdded(uint256 amount);
    event FundsRemoved(uint256 amount);
    event WinChanceUpdated(uint8 newChance);
    event WinPercentageUpdated(uint8 newPercentage);

    constructor(address _tokenAddress, address _nftCollectionAddress) Ownable(msg.sender) {
        token = IERC20(_tokenAddress);
        nftCollection = IERC721(_nftCollectionAddress);
    }

    function bet(uint256 _amount) external {
        require(_amount > 0, "Bet amount must be greater than 0");
        require(token.balanceOf(msg.sender) >= _amount, "Insufficient balance");
        require(token.allowance(msg.sender, address(this)) >= _amount, "Insufficient allowance");

        token.transferFrom(msg.sender, address(this), _amount);

        bool won = (random() % 100) < winChance;
        bool nftBonus = nftCollection.balanceOf(msg.sender) > 0;

        uint256 winnings = _amount;
        if (won) {
            winnings += (accumulatedFunds * winPercentage / 100);
            if (nftBonus) {
                winnings += (winnings * nftBonusPercentage / 100);
            }
            require(accumulatedFunds >= (winnings - _amount), "Insufficient accumulated funds");
            token.transfer(msg.sender, winnings);
            accumulatedFunds -= (winnings - _amount);
        } else {
            accumulatedFunds += _amount;
        }

        emit Bet(msg.sender, _amount, won, nftBonus);
    }

    function addFunds(uint256 _amount) external onlyOwner {
        require(token.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        accumulatedFunds += _amount;
        emit FundsAdded(_amount);
    }

    function removeFunds(uint256 _amount) external onlyOwner {
        require(_amount <= accumulatedFunds, "Insufficient accumulated funds");
        require(token.transfer(msg.sender, _amount), "Transfer failed");
        accumulatedFunds -= _amount;
        emit FundsRemoved(_amount);
    }

    function setWinChance(uint8 _newChance) external onlyOwner {
        require(_newChance > 0 && _newChance <= 100, "Invalid win chance");
        winChance = _newChance;
        emit WinChanceUpdated(_newChance);
    }

    function setWinPercentage(uint8 _newPercentage) external onlyOwner {
        require(_newPercentage > 0 && _newPercentage <= 100, "Invalid win percentage");
        winPercentage = _newPercentage;
        emit WinPercentageUpdated(_newPercentage);
    }

    function random() private view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, msg.sender)));
    }
}
