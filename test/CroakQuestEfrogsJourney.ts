import chai from "chai";
import hre from "hardhat";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";

const { expect } = chai;
const { ethers } = hre;

describe("CroakQuestEfrogsJourney", function () {
    let croakQuest: any;
    let token: any;
    let nft: any;
    let vrfCoordinator: any;
    let owner: any;
    let player1: any;
    let player2: any;
    const initialFunds = ethers.parseEther("1000");
    const betAmount = ethers.parseEther("10");

    const BASE_FEE = ethers.parseEther("0.1");
    const GAS_PRICE_LINK = ethers.parseUnits("1", "gwei");
    const KEY_HASH = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";
    const CALLBACK_GAS_LIMIT = 1000000;
    let subId: bigint;

    beforeEach(async function () {
        [owner, player1, player2] = await ethers.getSigners();

        // Deploy VRF Mock (V2_5 / V2Plus)
        const vrfFactory = await ethers.getContractFactory("VRFCoordinatorV2MockProxy");
        vrfCoordinator = await vrfFactory.deploy(BASE_FEE, GAS_PRICE_LINK);

        // Create subscription
        const txSub = await vrfCoordinator.createSubscription();
        const receiptSub = await txSub.wait();
        const subEvent = receiptSub?.logs.find((log: any) => {
            try {
                const parsed = vrfCoordinator.interface.parseLog({ topics: [...log.topics], data: log.data });
                return parsed?.name === 'SubscriptionCreated';
            } catch {
                return false;
            }
        });
        subId = vrfCoordinator.interface.parseLog({ topics: [...subEvent!.topics], data: subEvent!.data })!.args[0];

        // Fund subscription
        await vrfCoordinator.fundSubscription(subId, ethers.parseEther("10"));

        // Deploy Token contract
        const tokenFactory = await ethers.getContractFactory("MockERC20");
        token = await tokenFactory.deploy("Mock Token", "MTK");

        // Deploy NFT contract
        const nftFactory = await ethers.getContractFactory("MockERC721");
        nft = await nftFactory.deploy("Mock NFT", "MNFT");

        // Deploy CroakQuestEfrogsJourney
        const croakQuestFactory = await ethers.getContractFactory("CroakQuestEfrogsJourney");
        croakQuest = await croakQuestFactory.deploy(
            await token.getAddress(),
            await nft.getAddress(),
            await vrfCoordinator.getAddress(),
            subId,
            KEY_HASH,
            CALLBACK_GAS_LIMIT
        );

        // Add consumer to VRF
        await vrfCoordinator.addConsumer(subId, await croakQuest.getAddress());

        // Mint tokens to players and approve spending
        await token.mint(player1.address, initialFunds);
        await token.connect(player1).approve(await croakQuest.getAddress(), initialFunds);

        // Add initial funds to the contract
        await token.mint(owner.address, initialFunds);
        await token.connect(owner).approve(await croakQuest.getAddress(), initialFunds);
        await croakQuest.addFunds(initialFunds);
    });

    describe("Betting Workflow & VRF Randomness", function () {
        it("Should allow players to bet, emit BetRequested event, and store pending bet", async function () {
            const tx = await croakQuest.connect(player1).bet(betAmount);
            const receipt = await tx.wait();
            if (!receipt) throw new Error("Receipt not found");

            // Check if BetRequested event was emitted
            const betRequestedEvent = receipt.logs.find((log: any) => {
                try {
                    const parsed = croakQuest.interface.parseLog({ topics: [...log.topics], data: log.data });
                    return parsed?.name === 'BetRequested';
                } catch {
                    return false;
                }
            });
            expect(betRequestedEvent).to.not.be.undefined;

            const decodedEvent = croakQuest.interface.parseLog({ topics: [...betRequestedEvent!.topics], data: betRequestedEvent!.data });
            const [requestId, bettor, amount] = decodedEvent!.args;
            expect(bettor).to.equal(await player1.getAddress());
            expect(amount).to.equal(betAmount);
            expect(requestId).to.not.equal(0);

            // Verify s_pendingBets mapping
            const pendingBet = await croakQuest.s_pendingBets(requestId);
            expect(pendingBet.player).to.equal(await player1.getAddress());
            expect(pendingBet.amount).to.equal(betAmount);
            expect(pendingBet.resolved).to.be.false;
        });

        it("Should transfer tokens from player to contract on bet request", async function () {
            const initialPlayerBalance = await token.balanceOf(player1.address);
            const initialContractBalance = await token.balanceOf(await croakQuest.getAddress());

            await croakQuest.connect(player1).bet(betAmount);

            const finalPlayerBalance = await token.balanceOf(player1.address);
            const finalContractBalance = await token.balanceOf(await croakQuest.getAddress());

            expect(finalPlayerBalance).to.equal(initialPlayerBalance - betAmount);
            expect(finalContractBalance).to.equal(initialContractBalance + betAmount);
        });

        it("Should resolve pending bet, execute payout, and emit BetSettled on VRF callback", async function () {
            const tx = await croakQuest.connect(player1).bet(betAmount);
            const receipt = await tx.wait();
            const decodedRequested = croakQuest.interface.parseLog({
                topics: [...receipt!.logs.find((l: any) => {
                    try { return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.topics],
                data: receipt!.logs.find((l: any) => {
                    try { return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.data
            });
            const requestId = decodedRequested!.args[0];

            const txFulfill = await vrfCoordinator.fulfillRandomWords(requestId, await croakQuest.getAddress());
            const receiptFulfill = await txFulfill.wait();

            const betSettledEvent = receiptFulfill!.logs.find((log: any) => {
                try {
                    const parsed = croakQuest.interface.parseLog({ topics: [...log.topics], data: log.data });
                    return parsed?.name === 'BetSettled';
                } catch {
                    return false;
                }
            });
            expect(betSettledEvent).to.not.be.undefined;

            const decodedEvent = croakQuest.interface.parseLog({ topics: [...betSettledEvent!.topics], data: betSettledEvent!.data });
            const [settledRequestId, player, won, winnings] = decodedEvent!.args;

            expect(settledRequestId).to.equal(requestId);
            expect(player).to.equal(player1.address);
            expect(typeof won).to.equal("boolean");
            expect(winnings).to.not.be.undefined;

            const pendingBet = await croakQuest.s_pendingBets(requestId);
            expect(pendingBet.resolved).to.be.true;
        });

        it("Should apply NFT bonus in the callback when player owns an NFT", async function () {
            // Mint an NFT to player1
            await nft.mint(player1.address, 1);

            const tx = await croakQuest.connect(player1).bet(betAmount);
            const receipt = await tx.wait();
            const decodedRequested = croakQuest.interface.parseLog({
                topics: [...receipt!.logs.find((l: any) => {
                    try { return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.topics],
                data: receipt!.logs.find((l: any) => {
                    try { return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.data
            });
            const requestId = decodedRequested!.args[0];

            const txFulfill = await vrfCoordinator.fulfillRandomWords(requestId, await croakQuest.getAddress());
            const receiptFulfill = await txFulfill.wait();

            const betEvent = receiptFulfill!.logs.find((log: any) => {
                try {
                    const parsed = croakQuest.interface.parseLog({ topics: [...log.topics], data: log.data });
                    return parsed?.name === 'Bet';
                } catch {
                    return false;
                }
            });
            const decodedEvent = croakQuest.interface.parseLog({ topics: [...betEvent!.topics], data: betEvent!.data });
            const [, , , nftBonus] = decodedEvent!.args;

            expect(nftBonus).to.be.true;
        });

        it("Should update accumulated funds correctly on loss in callback", async function () {
            // Set a very low win chance (1%)
            await croakQuest.connect(owner).setWinChance(1);

            const initialAccumulatedFunds = await croakQuest.accumulatedFunds();

            const tx = await croakQuest.connect(player1).bet(betAmount);
            const receipt = await tx.wait();
            const decodedRequested = croakQuest.interface.parseLog({
                topics: [...receipt!.logs.find((l: any) => {
                    try { return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.topics],
                data: receipt!.logs.find((l: any) => {
                    try { return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.data
            });
            const requestId = decodedRequested!.args[0];

            // Use high random number to guarantee loss
            await vrfCoordinator.fulfillRandomWordsWithOverride(requestId, await croakQuest.getAddress(), [99]);

            const finalAccumulatedFunds = await croakQuest.accumulatedFunds();

            // Check if accumulated funds increased
            expect(finalAccumulatedFunds).to.equal(initialAccumulatedFunds + betAmount);
        });

        it("Should transfer winnings to player on win in callback", async function () {
            // Set a very high win chance (99%)
            await croakQuest.connect(owner).setWinChance(99);

            const initialPlayerBalance = await token.balanceOf(player1.address);
            const initialAccumulatedFunds = await croakQuest.accumulatedFunds();

            const tx = await croakQuest.connect(player1).bet(betAmount);
            const receipt = await tx.wait();
            const decodedRequested = croakQuest.interface.parseLog({
                topics: [...receipt!.logs.find((l: any) => {
                    try { return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.topics],
                data: receipt!.logs.find((l: any) => {
                    try { return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.data
            });
            const requestId = decodedRequested!.args[0];

            // Use low random number to guarantee win
            await vrfCoordinator.fulfillRandomWordsWithOverride(requestId, await croakQuest.getAddress(), [0]);

            const finalPlayerBalance = await token.balanceOf(player1.address);
            const finalAccumulatedFunds = await croakQuest.accumulatedFunds();

            expect(finalPlayerBalance).to.be.above(initialPlayerBalance);
            expect(finalAccumulatedFunds).to.be.below(initialAccumulatedFunds);
        });

        it("Should prevent smart contract attacker from querying or resolving outcome in the same block", async function () {
            const attackerFactory = await ethers.getContractFactory("AttackerContract");
            const attacker = await attackerFactory.deploy(
                await croakQuest.getAddress(),
                await token.getAddress()
            );

            // Fund attacker contract
            await token.mint(await attacker.getAddress(), initialFunds);

            // Attacker places bet and tries same-block inspection
            await expect(attacker.attemptSameBlockExploit(betAmount)).to.not.be.reverted;
        });

        it("Should use snapshotted winChance and winPercentage even if owner updates settings during pending bet", async function () {
            // Player bets when default winChance is 5%
            const tx = await croakQuest.connect(player1).bet(betAmount);
            const receipt = await tx.wait();
            const decodedRequested = croakQuest.interface.parseLog({
                topics: [...receipt!.logs.find((l: any) => {
                    try { return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.topics],
                data: receipt!.logs.find((l: any) => {
                    try { return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.data
            });
            const requestId = decodedRequested!.args[0];

            // Owner changes winChance to 99% while bet is in flight
            await croakQuest.connect(owner).setWinChance(99);

            // Random word 10: with snapshotted winChance (5%), 10 >= 5 => loss
            const initialAccumulatedFunds = await croakQuest.accumulatedFunds();
            await vrfCoordinator.fulfillRandomWordsWithOverride(requestId, await croakQuest.getAddress(), [10]);

            const finalAccumulatedFunds = await croakQuest.accumulatedFunds();
            expect(finalAccumulatedFunds).to.equal(initialAccumulatedFunds + betAmount);
        });
    });

    describe("Dynamic Max Bet Cap & Administrative Settings", function () {
        it("Should calculate maxBetAmount correctly based on accumulated funds and percentage", async function () {
            const maxBet = await croakQuest.maxBetAmount();
            expect(maxBet).to.equal(ethers.parseEther("50"));
        });

        it("Should revert with BetExceedsMaxLiquidity when bet exceeds max bet cap", async function () {
            const bet60 = ethers.parseEther("60");
            const maxBet50 = ethers.parseEther("50");

            await expect(croakQuest.connect(player1).bet(bet60))
                .to.be.revertedWithCustomError(croakQuest, "BetExceedsMaxLiquidity")
                .withArgs(bet60, maxBet50);
        });

        it("Should allow a bet exactly at or below the max bet cap", async function () {
            const bet50 = ethers.parseEther("50");
            await expect(croakQuest.connect(player1).bet(bet50)).to.not.be.reverted;
        });

        it("Should automatically scale up max bet cap when accumulated funds increase", async function () {
            await token.mint(owner.address, ethers.parseEther("1000"));
            await token.connect(owner).approve(await croakQuest.getAddress(), ethers.parseEther("1000"));

            await croakQuest.connect(owner).addFunds(ethers.parseEther("1000"));
            expect(await croakQuest.maxBetAmount()).to.equal(ethers.parseEther("100"));

            const bet60 = ethers.parseEther("60");
            await expect(croakQuest.connect(player1).bet(bet60)).to.not.be.reverted;
        });

        it("Should allow owner to update VRF configuration and maxBetPercentage", async function () {
            await expect(croakQuest.connect(owner).setMaxBetPercentage(10))
                .to.emit(croakQuest, "MaxBetPercentageUpdated")
                .withArgs(10);

            expect(await croakQuest.maxBetPercentage()).to.equal(10);

            await expect(croakQuest.connect(owner).setSubscriptionId(999))
                .to.emit(croakQuest, "SubscriptionIdSet")
                .withArgs(999);

            await expect(croakQuest.connect(owner).setCallbackGasLimit(500000))
                .to.emit(croakQuest, "CallbackGasLimitSet")
                .withArgs(500000);

            await expect(croakQuest.connect(owner).setRequestConfirmations(5))
                .to.emit(croakQuest, "RequestConfirmationsSet")
                .withArgs(5);
        });

        it("Should revert when setMaxBetPercentage is called with invalid values or by non-owner", async function () {
            await expect(croakQuest.connect(player1).setMaxBetPercentage(10))
                .to.be.revertedWithCustomError(croakQuest, "OwnableUnauthorizedAccount")
                .withArgs(player1.address);

            await expect(croakQuest.connect(owner).setMaxBetPercentage(0))
                .to.be.revertedWithCustomError(croakQuest, "InvalidMaxBetPercentage");

            await expect(croakQuest.connect(owner).setMaxBetPercentage(26))
                .to.be.revertedWithCustomError(croakQuest, "InvalidMaxBetPercentage");
        });
    });

    describe("Pausable Emergency Stop", function () {
        it("Should allow betting when not paused", async function () {
            expect(await croakQuest.paused()).to.be.false;
            await expect(croakQuest.connect(player1).bet(betAmount)).to.not.be.reverted;
        });

        it("Should allow owner to pause and emit Paused event", async function () {
            await expect(croakQuest.connect(owner).pause())
                .to.emit(croakQuest, "Paused")
                .withArgs(owner.address);

            expect(await croakQuest.paused()).to.be.true;
        });

        it("Should revert bet with EnforcedPause when paused", async function () {
            await croakQuest.connect(owner).pause();

            await expect(croakQuest.connect(player1).bet(betAmount))
                .to.be.revertedWithCustomError(croakQuest, "EnforcedPause");
        });

        it("Should allow owner to call removeFunds when contract is paused", async function () {
            await croakQuest.connect(owner).pause();

            const withdrawAmount = ethers.parseEther("100");
            await expect(croakQuest.connect(owner).removeFunds(withdrawAmount))
                .to.emit(croakQuest, "FundsRemoved")
                .withArgs(withdrawAmount);
        });

        it("Should revert pause or unpause when called by non-owner", async function () {
            await expect(croakQuest.connect(player1).pause())
                .to.be.revertedWithCustomError(croakQuest, "OwnableUnauthorizedAccount")
                .withArgs(player1.address);

            await croakQuest.connect(owner).pause();

            await expect(croakQuest.connect(player1).unpause())
                .to.be.revertedWithCustomError(croakQuest, "OwnableUnauthorizedAccount")
                .withArgs(player1.address);
        });

        it("Should allow owner to unpause and emit Unpaused event", async function () {
            await croakQuest.connect(owner).pause();

            await expect(croakQuest.connect(owner).unpause())
                .to.emit(croakQuest, "Unpaused")
                .withArgs(owner.address);

            expect(await croakQuest.paused()).to.be.false;
        });

        it("Should allow betting again after owner unpauses", async function () {
            await croakQuest.connect(owner).pause();
            await expect(croakQuest.connect(player1).bet(betAmount)).to.be.revertedWithCustomError(croakQuest, "EnforcedPause");

            await croakQuest.connect(owner).unpause();
            await expect(croakQuest.connect(player1).bet(betAmount)).to.not.be.reverted;
        });
    });

    describe("Reentrancy Guard & Checks-Effects-Interactions Security", function () {
        let reentrantToken: any;
        let croakQuestReentrant: any;

        beforeEach(async function () {
            const reentrantTokenFactory = await ethers.getContractFactory("ReentrantERC20");
            reentrantToken = await reentrantTokenFactory.deploy("Reentrant Token", "RETK");

            const croakQuestFactory = await ethers.getContractFactory("CroakQuestEfrogsJourney");
            croakQuestReentrant = await croakQuestFactory.deploy(
                await reentrantToken.getAddress(),
                await nft.getAddress(),
                await vrfCoordinator.getAddress(),
                subId,
                KEY_HASH,
                CALLBACK_GAS_LIMIT
            );

            await vrfCoordinator.addConsumer(subId, await croakQuestReentrant.getAddress());
            await reentrantToken.setCroakQuestAddress(await croakQuestReentrant.getAddress());

            await reentrantToken.mint(player1.address, initialFunds);
            await reentrantToken.connect(player1).approve(await croakQuestReentrant.getAddress(), initialFunds);

            await reentrantToken.mint(owner.address, initialFunds);
            await reentrantToken.connect(owner).approve(await croakQuestReentrant.getAddress(), initialFunds);
            await croakQuestReentrant.connect(owner).addFunds(initialFunds);
        });

        it("Should deduct accumulatedFunds before calling token transfer during payout resolution", async function () {
            await croakQuestReentrant.connect(owner).setWinChance(99);

            const tx = await croakQuestReentrant.connect(player1).bet(betAmount);
            const receipt = await tx.wait();
            const decodedRequested = croakQuestReentrant.interface.parseLog({
                topics: [...receipt!.logs.find((l: any) => {
                    try { return croakQuestReentrant.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.topics],
                data: receipt!.logs.find((l: any) => {
                    try { return croakQuestReentrant.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.data
            });
            const requestId = decodedRequested!.args[0];

            await reentrantToken.setAttemptReentrancy(true);

            const initialFundsBefore = await croakQuestReentrant.accumulatedFunds();

            await vrfCoordinator.fulfillRandomWordsWithOverride(requestId, await croakQuestReentrant.getAddress(), [0]);

            expect(await reentrantToken.reentrancyAttempted()).to.be.true;
            expect(await reentrantToken.reentrancyFailed()).to.be.true;

            const accumulatedDuringTransfer = await reentrantToken.accumulatedFundsAtTransfer();
            expect(accumulatedDuringTransfer).to.be.below(initialFundsBefore);
        });
    });

    describe("SafeERC20 Security", function () {
        let failingToken: any;
        let croakQuestFailing: any;

        beforeEach(async function () {
            // Deploy Failing Token contract
            const failingTokenFactory = await ethers.getContractFactory("MockFailingERC20");
            failingToken = await failingTokenFactory.deploy("Mock Failing Token", "MFTK");

            // Deploy CroakQuestEfrogsJourney with failing token
            const croakQuestFactory = await ethers.getContractFactory("CroakQuestEfrogsJourney");
            croakQuestFailing = await croakQuestFactory.deploy(
                await failingToken.getAddress(),
                await nft.getAddress(),
                await vrfCoordinator.getAddress(),
                subId,
                KEY_HASH,
                CALLBACK_GAS_LIMIT
            );

            // Add consumer to VRF
            await vrfCoordinator.addConsumer(subId, await croakQuestFailing.getAddress());

            // Mint tokens and approve spending
            await failingToken.mint(player1.address, initialFunds);
            await failingToken.connect(player1).approve(await croakQuestFailing.getAddress(), initialFunds);

            await failingToken.mint(owner.address, initialFunds);
            await failingToken.connect(owner).approve(await croakQuestFailing.getAddress(), initialFunds);
            await croakQuestFailing.connect(owner).addFunds(initialFunds);
        });

        it("Should revert bet when transferFrom returns false", async function () {
            await failingToken.setFailTransferFrom(true);
            await expect(croakQuestFailing.connect(player1).bet(betAmount))
                .to.be.revertedWithCustomError(croakQuestFailing, "SafeERC20FailedOperation")
                .withArgs(await failingToken.getAddress());
        });

        it("Should revert addFunds when transferFrom returns false", async function () {
            await failingToken.setFailTransferFrom(true);
            await expect(croakQuestFailing.connect(owner).addFunds(betAmount))
                .to.be.revertedWithCustomError(croakQuestFailing, "SafeERC20FailedOperation")
                .withArgs(await failingToken.getAddress());
        });

        it("Should revert fulfillRandomWords payout when token transfer returns false", async function () {
            await croakQuestFailing.connect(owner).setWinChance(99);

            const tx = await croakQuestFailing.connect(player1).bet(betAmount);
            const receipt = await tx.wait();
            const decodedRequested = croakQuestFailing.interface.parseLog({
                topics: [...receipt!.logs.find((l: any) => {
                    try { return croakQuestFailing.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.topics],
                data: receipt!.logs.find((l: any) => {
                    try { return croakQuestFailing.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested' } catch { return false }
                })!.data
            });
            const requestId = decodedRequested!.args[0];

            await failingToken.setFailTransfer(true);

            // Direct call from coordinator reverts with SafeERC20FailedOperation
            const vrfAddress = await vrfCoordinator.getAddress();
            await ethers.provider.send("hardhat_setBalance", [vrfAddress, "0x1000000000000000000"]);
            const coordinatorSigner = await ethers.getImpersonatedSigner(vrfAddress);

            await expect(
                croakQuestFailing.connect(coordinatorSigner).rawFulfillRandomWords(requestId, [0])
            ).to.be.revertedWithCustomError(croakQuestFailing, "SafeERC20FailedOperation")
                .withArgs(await failingToken.getAddress());

            // VRF Coordinator fulfillRandomWordsWithOverride captures failure (success = false)
            const txFulfill = await vrfCoordinator.fulfillRandomWordsWithOverride(requestId, await croakQuestFailing.getAddress(), [0]);
            const receiptFulfill = await txFulfill.wait();
            const fulfilledEvent = receiptFulfill!.logs.find((l: any) => {
                try { return vrfCoordinator.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'RandomWordsFulfilled' } catch { return false }
            });
            const decodedFulfilled = vrfCoordinator.interface.parseLog({ topics: [...fulfilledEvent.topics], data: fulfilledEvent.data });
            expect(decodedFulfilled!.args.success).to.be.false;
        });

        it("Should revert removeFunds when transfer returns false", async function () {
            await failingToken.setFailTransfer(true);
            const withdrawAmount = ethers.parseEther("100");
            await expect(croakQuestFailing.connect(owner).removeFunds(withdrawAmount))
                .to.be.revertedWithCustomError(croakQuestFailing, "SafeERC20FailedOperation")
                .withArgs(await failingToken.getAddress());
        });
    });
});
