// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

contract CroakQuestEfrogsJourney is VRFConsumerBaseV2Plus, ReentrancyGuard {
    IERC20 public immutable token;
    IERC721 public immutable nftCollection;

    uint8 public winChance = 5; // Default 5% chance to win
    uint8 public winPercentage = 5; // Default 5% of accumulated funds as additional winnings
    uint8 public nftBonusPercentage = 5; // Additional 5% bonus for NFT holders
    uint8 public maxBetPercentage = 5; // Default max bet cap of 5% of accumulated funds
    uint256 public accumulatedFunds;

    // VRF Variables
    uint256 public s_subscriptionId;
    bytes32 public s_keyHash;
    uint32 public s_callbackGasLimit;
    uint16 public s_requestConfirmations = 3;
    uint32 public constant NUM_WORDS = 1;

    struct PendingBet {
        address player;
        uint256 amount;
        bool nftBonus;
        bool resolved;
    }

    mapping(uint256 => PendingBet) public s_pendingBets;

    error InvalidAmount();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InsufficientAccumulatedFunds();
    error TransferFailed();
    error InvalidWinChance();
    error InvalidWinPercentage();
    error InvalidMaxBetPercentage();
    error BetExceedsMaxLiquidity(uint256 amount, uint256 maxBet);
    error AlreadyResolved();
    error RequestNotFound();

    event Bet(address indexed player, uint256 amount, bool won, bool nftBonus);
    event BetRequested(uint256 indexed requestId, address indexed player, uint256 amount);
    event BetSettled(uint256 indexed requestId, address indexed player, bool won, uint256 winnings);
    event FundsAdded(uint256 amount);
    event FundsRemoved(uint256 amount);
    event WinChanceUpdated(uint8 newChance);
    event WinPercentageUpdated(uint8 newPercentage);
    event MaxBetPercentageUpdated(uint8 newPercentage);
    event SubscriptionIdSet(uint256 subscriptionId);
    event KeyHashSet(bytes32 keyHash);
    event CallbackGasLimitSet(uint32 callbackGasLimit);
    event RequestConfirmationsSet(uint16 requestConfirmations);

    constructor(
        address _tokenAddress,
        address _nftCollectionAddress,
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash,
        uint32 _callbackGasLimit
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        token = IERC20(_tokenAddress);
        nftCollection = IERC721(_nftCollectionAddress);
        s_subscriptionId = _subscriptionId;
        s_keyHash = _keyHash;
        s_callbackGasLimit = _callbackGasLimit;
    }

    function setSubscriptionId(uint256 _subscriptionId) external onlyOwner {
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

    function setRequestConfirmations(uint16 _requestConfirmations) external onlyOwner {
        s_requestConfirmations = _requestConfirmations;
        emit RequestConfirmationsSet(_requestConfirmations);
    }

    function maxBetAmount() public view returns (uint256) {
        return (accumulatedFunds * maxBetPercentage) / 100;
    }

    function bet(uint256 _amount) external nonReentrant returns (uint256 requestId) {
        if (_amount == 0) revert InvalidAmount();
        uint256 maxBet = maxBetAmount();
        if (_amount > maxBet) revert BetExceedsMaxLiquidity(_amount, maxBet);
        if (token.balanceOf(msg.sender) < _amount) revert InsufficientBalance();
        if (token.allowance(msg.sender, address(this)) < _amount) revert InsufficientAllowance();

        if (!token.transferFrom(msg.sender, address(this), _amount)) revert TransferFailed();

        bool nftBonus = nftCollection.balanceOf(msg.sender) > 0;

        requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: s_keyHash,
                subId: s_subscriptionId,
                requestConfirmations: s_requestConfirmations,
                callbackGasLimit: s_callbackGasLimit,
                numWords: NUM_WORDS,
                extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: false}))
            })
        );

        s_pendingBets[requestId] = PendingBet({
            player: msg.sender,
            amount: _amount,
            nftBonus: nftBonus,
            resolved: false
        });

        emit BetRequested(requestId, msg.sender, _amount);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        PendingBet storage pending = s_pendingBets[requestId];
        if (pending.player == address(0)) revert RequestNotFound();
        if (pending.resolved) revert AlreadyResolved();

        pending.resolved = true;

        bool won = (randomWords[0] % 100) < winChance;
        bool nftBonus = pending.nftBonus;
        uint256 amount = pending.amount;

        uint256 winnings = amount;
        if (won) {
            winnings += (accumulatedFunds * winPercentage / 100);
            if (nftBonus) {
                winnings += (winnings * nftBonusPercentage / 100);
            }
            if (accumulatedFunds >= (winnings - amount)) {
                accumulatedFunds -= (winnings - amount);
                token.transfer(pending.player, winnings);
            } else {
                // Fallback: refund bet amount
                token.transfer(pending.player, amount);
                won = false;
                winnings = amount;
            }
        } else {
            accumulatedFunds += amount;
            winnings = 0;
        }

        emit BetSettled(requestId, pending.player, won, winnings);
        emit Bet(pending.player, amount, won, nftBonus);
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

    function setMaxBetPercentage(uint8 _newPercentage) external onlyOwner {
        if (_newPercentage == 0 || _newPercentage > 25) revert InvalidMaxBetPercentage();
        maxBetPercentage = _newPercentage;
        emit MaxBetPercentageUpdated(_newPercentage);
    }
}
