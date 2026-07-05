"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const hardhat_1 = require("hardhat");
describe("CroakQuestEfrogsJourney", function () {
    let croakQuest;
    let token;
    let nft;
    let vrfCoordinator;
    let owner;
    let player1;
    let player2;
    const initialFunds = hardhat_1.ethers.parseEther("1000");
    const betAmount = hardhat_1.ethers.parseEther("10");
    const BASE_FEE = hardhat_1.ethers.parseEther("0.1");
    const GAS_PRICE_LINK = hardhat_1.ethers.parseUnits("1", "gwei");
    const KEY_HASH = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";
    const CALLBACK_GAS_LIMIT = 1000000;
    let subId;
    beforeEach(async function () {
        [owner, player1, player2] = await hardhat_1.ethers.getSigners();
        // Deploy VRF Mock
        const vrfFactory = (await hardhat_1.ethers.getContractFactory("VRFCoordinatorV2MockProxy"));
        vrfCoordinator = await vrfFactory.deploy(BASE_FEE, GAS_PRICE_LINK);
        // Create subscription
        const txSub = await vrfCoordinator.createSubscription();
        const receiptSub = await txSub.wait();
        const subEvent = receiptSub?.logs.find(log => {
            try {
                const parsed = vrfCoordinator.interface.parseLog({ topics: [...log.topics], data: log.data });
                return parsed?.name === 'SubscriptionCreated';
            }
            catch {
                return false;
            }
        });
        subId = vrfCoordinator.interface.parseLog({ topics: [...subEvent.topics], data: subEvent.data }).args[0];
        // Fund subscription
        await vrfCoordinator.fundSubscription(subId, hardhat_1.ethers.parseEther("10"));
        // Deploy Token contract
        const tokenFactory = (await hardhat_1.ethers.getContractFactory("MockERC20"));
        token = await tokenFactory.deploy("Mock Token", "MTK");
        // Deploy NFT contract
        const nftFactory = (await hardhat_1.ethers.getContractFactory("MockERC721"));
        nft = await nftFactory.deploy("Mock NFT", "MNFT");
        // Deploy CroakQuestEfrogsJourney
        const croakQuestFactory = (await hardhat_1.ethers.getContractFactory("CroakQuestEfrogsJourney"));
        croakQuest = await croakQuestFactory.deploy(await token.getAddress(), await nft.getAddress(), await vrfCoordinator.getAddress(), subId, KEY_HASH, CALLBACK_GAS_LIMIT);
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
    describe("Betting", function () {
        it("Should allow players to bet and emit BetRequested event", async function () {
            const tx = await croakQuest.connect(player1).bet(betAmount);
            const receipt = await tx.wait();
            if (!receipt)
                throw new Error("Receipt not found");
            // Check if BetRequested event was emitted
            const betRequestedEvent = receipt.logs.find(log => {
                try {
                    const parsed = croakQuest.interface.parseLog({ topics: [...log.topics], data: log.data });
                    return parsed?.name === 'BetRequested';
                }
                catch {
                    return false;
                }
            });
            (0, chai_1.expect)(betRequestedEvent).to.not.be.undefined;
            const decodedEvent = croakQuest.interface.parseLog({ topics: [...betRequestedEvent.topics], data: betRequestedEvent.data });
            const [requestId, bettor, amount] = decodedEvent.args;
            (0, chai_1.expect)(bettor).to.equal(await player1.getAddress());
            (0, chai_1.expect)(amount).to.equal(betAmount);
            (0, chai_1.expect)(requestId).to.not.equal(0);
        });
        it("Should transfer tokens from player to contract on bet", async function () {
            const initialPlayerBalance = await token.balanceOf(player1.address);
            const initialContractBalance = await token.balanceOf(await croakQuest.getAddress());
            await croakQuest.connect(player1).bet(betAmount);
            const finalPlayerBalance = await token.balanceOf(player1.address);
            const finalContractBalance = await token.balanceOf(await croakQuest.getAddress());
            (0, chai_1.expect)(finalPlayerBalance).to.equal(initialPlayerBalance - betAmount);
            (0, chai_1.expect)(finalContractBalance).to.equal(initialContractBalance + betAmount);
        });
        it("Should apply NFT bonus in the callback when player owns an NFT", async function () {
            // Mint an NFT to player1
            await nft.mint(player1.address, 1);
            const tx = await croakQuest.connect(player1).bet(betAmount);
            const receipt = await tx.wait();
            const decodedRequested = croakQuest.interface.parseLog({
                topics: [...receipt.logs.find(l => {
                        try {
                            return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested';
                        }
                        catch {
                            return false;
                        }
                    }).topics],
                data: receipt.logs.find(l => {
                    try {
                        return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested';
                    }
                    catch {
                        return false;
                    }
                }).data
            });
            const requestId = decodedRequested.args[0];
            const txFulfill = await vrfCoordinator.fulfillRandomWords(requestId, await croakQuest.getAddress());
            const receiptFulfill = await txFulfill.wait();
            const betEvent = receiptFulfill.logs.find(log => {
                try {
                    const parsed = croakQuest.interface.parseLog({ topics: [...log.topics], data: log.data });
                    return parsed?.name === 'Bet';
                }
                catch {
                    return false;
                }
            });
            const decodedEvent = croakQuest.interface.parseLog({ topics: [...betEvent.topics], data: betEvent.data });
            const [, , , nftBonus] = decodedEvent.args;
            (0, chai_1.expect)(nftBonus).to.be.true;
        });
        it("Should update accumulated funds correctly on loss in callback", async function () {
            // Set a very low win chance (1%)
            await croakQuest.connect(owner).setWinChance(1);
            const initialAccumulatedFunds = await croakQuest.accumulatedFunds();
            const tx = await croakQuest.connect(player1).bet(betAmount);
            const receipt = await tx.wait();
            const decodedRequested = croakQuest.interface.parseLog({
                topics: [...receipt.logs.find(l => {
                        try {
                            return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested';
                        }
                        catch {
                            return false;
                        }
                    }).topics],
                data: receipt.logs.find(l => {
                    try {
                        return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested';
                    }
                    catch {
                        return false;
                    }
                }).data
            });
            const requestId = decodedRequested.args[0];
            // Use a high random number to ensure loss
            await vrfCoordinator.fulfillRandomWordsWithOverride(requestId, await croakQuest.getAddress(), [99]);
            const finalAccumulatedFunds = await croakQuest.accumulatedFunds();
            // Check if accumulated funds increased
            (0, chai_1.expect)(finalAccumulatedFunds).to.equal(initialAccumulatedFunds + betAmount);
        });
        it("Should transfer winnings to player on win in callback", async function () {
            // Set a very high win chance (99%)
            await croakQuest.connect(owner).setWinChance(99);
            const initialPlayerBalance = await token.balanceOf(player1.address);
            const initialAccumulatedFunds = await croakQuest.accumulatedFunds();
            const tx = await croakQuest.connect(player1).bet(betAmount);
            await tx.wait();
            const receipt = await tx.wait();
            const decodedRequested = croakQuest.interface.parseLog({
                topics: [...receipt.logs.find(l => {
                        try {
                            return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested';
                        }
                        catch {
                            return false;
                        }
                    }).topics],
                data: receipt.logs.find(l => {
                    try {
                        return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested';
                    }
                    catch {
                        return false;
                    }
                }).data
            });
            const requestId = decodedRequested.args[0];
            // Use a low random number to ensure win (0)
            await vrfCoordinator.fulfillRandomWordsWithOverride(requestId, await croakQuest.getAddress(), [0]);
            const finalPlayerBalance = await token.balanceOf(player1.address);
            const finalAccumulatedFunds = await croakQuest.accumulatedFunds();
            // Check if player balance increased
            (0, chai_1.expect)(finalPlayerBalance).to.be.at.least(initialPlayerBalance);
            // Check if accumulated funds decreased
            (0, chai_1.expect)(finalAccumulatedFunds).to.be.below(initialAccumulatedFunds);
        });
    });
});
