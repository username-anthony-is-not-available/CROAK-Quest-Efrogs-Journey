// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/vrf/interfaces/VRFCoordinatorV2Interface.sol";

contract CroakQuestEfrogsJourney is Ownable, VRFConsumerBaseV2, ReentrancyGuard {
    IERC20 public immutable token;
    IERC721 public immutable nftCollection;

    uint8 public winChance = 5; // Default 5% chance to win
    uint8 public winPercentage = 5; // Default 5% of accumulated funds as additional winnings
    uint8 public nftBonusPercentage = 5; // Additional 5% bonus for NFT holders
    uint256 public accumulatedFunds;

    // VRF Variables
    VRFCoordinatorV2Interface public immutable COORDINATOR;
    uint64 public s_subscriptionId;
    bytes32 public s_keyHash;
    uint32 public s_callbackGasLimit;
    uint16 public constant REQUEST_CONFIRMATIONS = 3;
    uint32 public constant NUM_WORDS = 1;

    struct BetRequest {
        address player;
        uint256 amount;
        bool nftBonus;
    }

    mapping(uint256 => BetRequest) public s_requests;

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
    event BetRequested(uint256 indexed requestId, address indexed player, uint256 amount);
    event SubscriptionIdSet(uint64 subscriptionId);
    event KeyHashSet(bytes32 keyHash);
    event CallbackGasLimitSet(uint32 callbackGasLimit);

    constructor(
        address _tokenAddress,
        address _nftCollectionAddress,
        address _vrfCoordinator,
        uint64 _subscriptionId,
        bytes32 _keyHash,
        uint32 _callbackGasLimit
    ) Ownable(msg.sender) VRFConsumerBaseV2(_vrfCoordinator) {
        token = IERC20(_tokenAddress);
        nftCollection = IERC721(_nftCollectionAddress);
        COORDINATOR = VRFCoordinatorV2Interface(_vrfCoordinator);
        s_subscriptionId = _subscriptionId;
        s_keyHash = _keyHash;
        s_callbackGasLimit = _callbackGasLimit;
    }

    function setSubscriptionId(uint64 _subscriptionId) external onlyOwner {
        s_subscriptionId = _subscriptionId;
        emit SubscriptionIdSet(_subscriptionId);
    }

    function setKeyHash(bytes32 _keyHash) external onlyOwner {
        s_keyHash = _keyHash;
        emit KeyHashSet(_keyHash);
    }

    function setCallbackGasLimit(uint32 _callbackGasLimit) external onlyOwner {
        s_callbackGasLimit = _callbackGasLimit;
        emit CallbackGasLimitSet(_callbackGasLimit);
    }

    function bet(uint256 _amount) external nonReentrant {
        if (_amount == 0) revert InvalidAmount();
        if (token.balanceOf(msg.sender) < _amount) revert InsufficientBalance();
        if (token.allowance(msg.sender, address(this)) < _amount) revert InsufficientAllowance();

        if (!token.transferFrom(msg.sender, address(this), _amount)) revert TransferFailed();

        bool nftBonus = nftCollection.balanceOf(msg.sender) > 0;

        uint256 requestId = COORDINATOR.requestRandomWords(
            s_keyHash,
            s_subscriptionId,
            REQUEST_CONFIRMATIONS,
            s_callbackGasLimit,
            NUM_WORDS
        );

        s_requests[requestId] = BetRequest({
            player: msg.sender,
            amount: _amount,
            nftBonus: nftBonus
        });

        emit BetRequested(requestId, msg.sender, _amount);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        BetRequest storage request = s_requests[requestId];
        if (request.player == address(0)) return;

        bool won = (randomWords[0] % 100) < winChance;
        bool nftBonus = request.nftBonus;
        uint256 amount = request.amount;

        uint256 winnings = amount;
        if (won) {
            winnings += (accumulatedFunds * winPercentage / 100);
            if (nftBonus) {
                winnings += (winnings * nftBonusPercentage / 100);
            }
            if (accumulatedFunds >= (winnings - amount)) {
                token.transfer(request.player, winnings);
                accumulatedFunds -= (winnings - amount);
            } else {
                // Should not happen if house is well funded, but as a fallback, refund the bet
                token.transfer(request.player, amount);
                won = false;
            }
        } else {
            accumulatedFunds += amount;
        }

        emit Bet(request.player, amount, won, nftBonus);
        delete s_requests[requestId];
    }

    function addFunds(uint256 _amount) external onlyOwner nonReentrant {
        if (!token.transferFrom(msg.sender, address(this), _amount)) revert TransferFailed();
        accumulatedFunds += _amount;
        emit FundsAdded(_amount);
    }

    function removeFunds(uint256 _amount) external onlyOwner nonReentrant {
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

}
