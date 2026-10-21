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
                .to.be.revertedWith("Only callable by owner");

            await expect(croakQuest.connect(owner).setMaxBetPercentage(0))
                .to.be.revertedWithCustomError(croakQuest, "InvalidMaxBetPercentage");

            await expect(croakQuest.connect(owner).setMaxBetPercentage(26))
                .to.be.revertedWithCustomError(croakQuest, "InvalidMaxBetPercentage");
        });
    });
});
