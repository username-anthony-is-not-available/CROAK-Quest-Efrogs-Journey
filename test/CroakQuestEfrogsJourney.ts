import { expect } from "chai";
import { ethers } from "hardhat";
import {
    CroakQuestEfrogsJourney,
    MockERC20,
    MockERC721,
    CroakQuestEfrogsJourney__factory,
    MockERC20__factory,
    MockERC721__factory
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("CroakQuestEfrogsJourney", function () {
    let croakQuest: CroakQuestEfrogsJourney;
    let token: MockERC20;
    let nft: MockERC721;
    let owner: SignerWithAddress;
    let player1: SignerWithAddress;
    let player2: SignerWithAddress;
    const initialFunds = ethers.parseEther("1000");
    const betAmount = ethers.parseEther("10");

    beforeEach(async function () {
        [owner, player1, player2] = await ethers.getSigners();

        // Deploy Token contract
        const tokenFactory = (await ethers.getContractFactory("MockERC20")) as MockERC20__factory;
        token = await tokenFactory.deploy("Mock Token", "MTK");

        // Deploy NFT contract
        const nftFactory = (await ethers.getContractFactory("MockERC721")) as MockERC721__factory;
        nft = await nftFactory.deploy("Mock NFT", "MNFT");

        // Deploy CroakQuestEfrogsJourney
        const croakQuestFactory = (await ethers.getContractFactory("CroakQuestEfrogsJourney")) as CroakQuestEfrogsJourney__factory;
        croakQuest = await croakQuestFactory.deploy(await token.getAddress(), await nft.getAddress());

        // Mint tokens to players and approve spending
        await token.mint(player1.address, initialFunds);
        await token.connect(player1).approve(await croakQuest.getAddress(), initialFunds);

        // Add initial funds to the contract
        await token.mint(owner.address, initialFunds);
        await token.connect(owner).approve(await croakQuest.getAddress(), initialFunds);
        await croakQuest.addFunds(initialFunds);
    });

    describe("Betting", function () {
        it("Should allow players to bet and emit correct event", async function () {
            const tx = await croakQuest.connect(player1).bet(betAmount);
            const receipt = await tx.wait();
            if (!receipt) throw new Error("Receipt not found");

            // Check if Bet event was emitted
            const betEvent = receipt.logs.find(log => {
                try {
                    const parsed = croakQuest.interface.parseLog({ topics: [...log.topics], data: log.data });
                    return parsed?.name === 'Bet';
                } catch {
                    return false;
                }
            });
            expect(betEvent).to.not.be.undefined;

            const decodedEvent = croakQuest.interface.parseLog({ topics: [...betEvent!.topics], data: betEvent!.data });
            const [bettor, amount, won, nftBonus] = decodedEvent!.args;
            expect(bettor).to.equal(await player1.getAddress());
            expect(amount).to.equal(betAmount);
            expect(typeof won).to.equal('boolean');
            expect(typeof nftBonus).to.equal('boolean');
        });

        it("Should transfer tokens from player to contract on bet", async function () {
            const initialPlayerBalance = await token.balanceOf(player1.address);
            const initialContractBalance = await token.balanceOf(await croakQuest.getAddress());

            await croakQuest.connect(player1).bet(betAmount);

            const finalPlayerBalance = await token.balanceOf(player1.address);
            const finalContractBalance = await token.balanceOf(await croakQuest.getAddress());

            expect(finalPlayerBalance).to.equal(initialPlayerBalance - betAmount);
            expect(finalContractBalance).to.equal(initialContractBalance + betAmount);
        });

        it("Should apply NFT bonus when player owns an NFT", async function () {
            // Mint an NFT to player1
            await nft.mint(player1.address, 1);

            const tx = await croakQuest.connect(player1).bet(betAmount);
            const receipt = await tx.wait();
            if (!receipt) throw new Error("Receipt not found");

            const betEvent = receipt.logs.find(log => {
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

        it("Should update accumulated funds correctly on likely loss", async function () {
            // Set a very low win chance (1%)
            await croakQuest.connect(owner).setWinChance(1);

            const initialAccumulatedFunds = await croakQuest.accumulatedFunds();

            await croakQuest.connect(player1).bet(betAmount);

            const finalAccumulatedFunds = await croakQuest.accumulatedFunds();

            // Check if accumulated funds increased (indicating a loss)
            expect(finalAccumulatedFunds).to.be.at.least(initialAccumulatedFunds);
        });

        it("Should transfer winnings to player on likely win", async function () {
            // Set a very high win chance (99%)
            await croakQuest.connect(owner).setWinChance(99);

            const initialPlayerBalance = await token.balanceOf(player1.address);
            const initialAccumulatedFunds = await croakQuest.accumulatedFunds();

            await croakQuest.connect(player1).bet(betAmount);

            const finalPlayerBalance = await token.balanceOf(player1.address);
            const finalAccumulatedFunds = await croakQuest.accumulatedFunds();

            // Check if player balance increased (indicating a win)
            expect(finalPlayerBalance).to.be.at.least(initialPlayerBalance);

            // Check if accumulated funds decreased or stayed the same
            expect(finalAccumulatedFunds).to.be.at.most(initialAccumulatedFunds);
        });
    });
});
