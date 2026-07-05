// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CroakQuestEfrogsJourney is Ownable {
    IERC20 public immutable token;
    IERC721 public immutable nftCollection;

    uint8 public winChance = 5; // Default 5% chance to win
    uint8 public winPercentage = 5; // Default 5% of accumulated funds as additional winnings
    uint8 public nftBonusPercentage = 5; // Additional 5% bonus for NFT holders
    uint256 public accumulatedFunds;

    error InvalidAmount();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InsufficientAccumulatedFunds();
    error TransferFailed();
    error InvalidWinChance();
    error InvalidWinPercentage();

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
        if (_amount == 0) revert InvalidAmount();
        if (token.balanceOf(msg.sender) < _amount) revert InsufficientBalance();
        if (token.allowance(msg.sender, address(this)) < _amount) revert InsufficientAllowance();

        if (!token.transferFrom(msg.sender, address(this), _amount)) revert TransferFailed();

        bool won = (random() % 100) < winChance;
        bool nftBonus = nftCollection.balanceOf(msg.sender) > 0;

        uint256 winnings = _amount;
        if (won) {
            winnings += (accumulatedFunds * winPercentage / 100);
            if (nftBonus) {
                winnings += (winnings * nftBonusPercentage / 100);
            }
            if (accumulatedFunds < (winnings - _amount)) revert InsufficientAccumulatedFunds();
            token.transfer(msg.sender, winnings);
            accumulatedFunds -= (winnings - _amount);
        } else {
            accumulatedFunds += _amount;
        }

        emit Bet(msg.sender, _amount, won, nftBonus);
    }

    function addFunds(uint256 _amount) external onlyOwner {
        if (!token.transferFrom(msg.sender, address(this), _amount)) revert TransferFailed();
        accumulatedFunds += _amount;
        emit FundsAdded(_amount);
    }

    function removeFunds(uint256 _amount) external onlyOwner {
        if (_amount > accumulatedFunds) revert InsufficientAccumulatedFunds();
        if (!token.transfer(msg.sender, _amount)) revert TransferFailed();
        accumulatedFunds -= _amount;
        emit FundsRemoved(_amount);
    }

    function setWinChance(uint8 _newChance) external onlyOwner {
        if (_newChance == 0 || _newChance > 100) revert InvalidWinChance();
        winChance = _newChance;
        emit WinChanceUpdated(_newChance);
    }

    function setWinPercentage(uint8 _newPercentage) external onlyOwner {
        if (_newPercentage == 0 || _newPercentage > 100) revert InvalidWinPercentage();
        winPercentage = _newPercentage;
        emit WinPercentageUpdated(_newPercentage);
    }

    function random() private view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, msg.sender)));
    }
}
