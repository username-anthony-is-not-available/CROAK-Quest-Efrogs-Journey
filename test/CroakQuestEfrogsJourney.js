import { expect } from "chai";

describe("CroakQuestEfrogsJourney", function () {
    let CroakQuestEfrogsJourney, croakQuest, Token, token, NFT, nft;
    let owner, player1, player2;
    const initialFunds = ethers.parseEther("1000");
    const betAmount = ethers.parseEther("10");

    beforeEach(async function () {
        [owner, player1, player2] = await ethers.getSigners();

        // Deploy Token contract
        Token = await ethers.getContractFactory("MockERC20");
        token = await Token.deploy("Mock Token", "MTK");

        // Deploy NFT contract
        NFT = await ethers.getContractFactory("MockERC721");
        nft = await NFT.deploy("Mock NFT", "MNFT");

        // Deploy CroakQuestEfrogsJourney
        CroakQuestEfrogsJourney = await ethers.getContractFactory("CroakQuestEfrogsJourney");
        croakQuest = await CroakQuestEfrogsJourney.deploy(await token.getAddress(), await nft.getAddress());

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

            // Check if Bet event was emitted
            const betEvent = receipt.logs.find(log => log.eventName === 'Bet');
            expect(betEvent).to.not.be.undefined;

            const [bettor, amount, won, nftBonus] = betEvent.args;
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

            const betEvent = receipt.logs.find(log => log.eventName === 'Bet');
            const [, , , nftBonus] = betEvent.args;

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