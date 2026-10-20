import chai from "chai";
import hre from "hardhat";
import WalletManager from "../src/web3/WalletManager.ts";

const { expect } = chai;
const { ethers } = hre;

describe("Linea Mainnet Fork Integration Tests", function () {
    const CROAK_TOKEN_ADDRESS = "0xaCb54d07cA167934F57F829BeE2cC665e1A5ebEF";
    const EFROGS_NFT_ADDRESS = "0x194395587d7b169e63eaf251e86b1892fa8f1960";
    const CROAK_QUEST_DEPLOYED_ADDRESS = "0xae685dbbf74a5684d25ee24d00ff33ac38b7b362";

    // Known Efrogs NFT owner on Linea mainnet (Owner of NFT #1)
    const EFROGS_HOLDER = "0xAD59EA85DB6F36c93DF955C9780F99e0bF447FF2";
    // Address holding CROAK tokens on mainnet fork
    const CROAK_HOLDER = "0xae685dbbf74a5684d25ee24d00ff33ac38b7b362";

    const BASE_FEE = ethers.parseEther("0.1");
    const GAS_PRICE_LINK = ethers.parseUnits("1", "gwei");
    const KEY_HASH = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";
    const CALLBACK_GAS_LIMIT = 1000000;

    let croakToken: any;
    let efrogsNFT: any;
    let deployedQuest: any;

    before(async function () {
        await ethers.provider.send("evm_mine", []);
        croakToken = await ethers.getContractAt("IERC20", CROAK_TOKEN_ADDRESS);
        efrogsNFT = await ethers.getContractAt("IERC721", EFROGS_NFT_ADDRESS);
        deployedQuest = await ethers.getContractAt(
            [
                "function token() view returns (address)",
                "function nftCollection() view returns (address)",
                "function accumulatedFunds() view returns (uint256)",
                "function maxBetPercentage() view returns (uint8)",
                "function winChance() view returns (uint8)"
            ],
            CROAK_QUEST_DEPLOYED_ADDRESS
        );
    });

    describe("$CROAK ERC20 Mainnet Token Contract", function () {
        it("Should verify $CROAK token identity and parameters on Linea fork", async function () {
            const tokenContract = await ethers.getContractAt(
                [
                    "function name() view returns (string)",
                    "function symbol() view returns (string)",
                    "function decimals() view returns (uint8)",
                    "function totalSupply() view returns (uint256)"
                ],
                CROAK_TOKEN_ADDRESS
            );

            expect(await tokenContract.name()).to.equal("CROAK");
            expect(await tokenContract.symbol()).to.equal("CROAK");
            expect(await tokenContract.decimals()).to.equal(18);

            const totalSupply = await tokenContract.totalSupply();
            expect(totalSupply).to.be.gt(0n);
        });

        it("Should support ERC20 operations with impersonated token holder on fork", async function () {
            await ethers.provider.send("hardhat_setBalance", [CROAK_HOLDER, "0x1000000000000000000"]);
            const holderSigner = await ethers.getImpersonatedSigner(CROAK_HOLDER);

            const balanceBefore = await croakToken.balanceOf(CROAK_HOLDER);
            expect(balanceBefore).to.be.gt(0n);

            const transferAmount = ethers.parseEther("10");
            await croakToken.connect(holderSigner).transfer(EFROGS_HOLDER, transferAmount);

            const efrogsCroakBalance = await croakToken.balanceOf(EFROGS_HOLDER);
            expect(efrogsCroakBalance).to.be.gte(transferAmount);
        });
    });

    describe("Efrogs ERC721 Mainnet NFT Contract", function () {
        it("Should verify Efrogs NFT identity and metadata on Linea fork", async function () {
            const nftContract = await ethers.getContractAt(
                [
                    "function name() view returns (string)",
                    "function symbol() view returns (string)",
                    "function ownerOf(uint256) view returns (address)",
                    "function balanceOf(address) view returns (uint256)",
                    "function tokenURI(uint256) view returns (string)"
                ],
                EFROGS_NFT_ADDRESS
            );

            const name = await nftContract.name();
            expect(name.trim()).to.equal("Ethereum Frogs");
            expect(await nftContract.symbol()).to.equal("EFROGS");

            const ownerOf1 = await nftContract.ownerOf(1);
            expect(ownerOf1.toLowerCase()).to.equal(EFROGS_HOLDER.toLowerCase());

            const balance = await nftContract.balanceOf(EFROGS_HOLDER);
            expect(balance).to.be.gt(0n);

            const tokenURI = await nftContract.tokenURI(1);
            expect(tokenURI).to.include("ipfs://");
        });
    });

    describe("CROAK Quest Deployed Contract Verification", function () {
        it("Should confirm deployed CROAK Quest contract references mainnet token and NFT addresses", async function () {
            const tokenAddress = await deployedQuest.token();
            const nftAddress = await deployedQuest.nftCollection();

            expect(tokenAddress.toLowerCase()).to.equal(CROAK_TOKEN_ADDRESS.toLowerCase());
            expect(nftAddress.toLowerCase()).to.equal(EFROGS_NFT_ADDRESS.toLowerCase());
        });
    });

    describe("New CroakQuest Deployment with Mainnet Tokens", function () {
        let vrfCoordinator: any;
        let localQuest: any;
        let subId: bigint;
        let owner: any;

        beforeEach(async function () {
            [owner] = await ethers.getSigners();

            const vrfFactory = await ethers.getContractFactory("VRFCoordinatorV2MockProxy");
            vrfCoordinator = await vrfFactory.deploy(BASE_FEE, GAS_PRICE_LINK);

            const txSub = await vrfCoordinator.createSubscription();
            const receiptSub = await txSub.wait();
            const subEvent = receiptSub?.logs.find((log: any) => {
                try {
                    return vrfCoordinator.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "SubscriptionCreated";
                } catch {
                    return false;
                }
            });
            subId = vrfCoordinator.interface.parseLog({ topics: [...subEvent.topics], data: subEvent.data })!.args[0];
            await vrfCoordinator.fundSubscription(subId, ethers.parseEther("10"));

            const croakQuestFactory = await ethers.getContractFactory("CroakQuestEfrogsJourney");
            localQuest = await croakQuestFactory.deploy(
                CROAK_TOKEN_ADDRESS,
                EFROGS_NFT_ADDRESS,
                await vrfCoordinator.getAddress(),
                subId,
                KEY_HASH,
                CALLBACK_GAS_LIMIT
            );

            await vrfCoordinator.addConsumer(subId, await localQuest.getAddress());
        });

        it("Should allow betting with real $CROAK and detect Efrogs NFT ownership on fork", async function () {
            await ethers.provider.send("hardhat_setBalance", [CROAK_HOLDER, "0x1000000000000000000"]);
            await ethers.provider.send("hardhat_setBalance", [EFROGS_HOLDER, "0x1000000000000000000"]);

            const croakSigner = await ethers.getImpersonatedSigner(CROAK_HOLDER);
            const efrogsSigner = await ethers.getImpersonatedSigner(EFROGS_HOLDER);

            // Fund contract owner with 100 CROAK and add funds to localQuest
            const houseFunds = ethers.parseEther("100");
            await croakToken.connect(croakSigner).transfer(owner.address, houseFunds);
            await croakToken.connect(owner).approve(await localQuest.getAddress(), houseFunds);
            await localQuest.connect(owner).addFunds(houseFunds);

            // Transfer 10 CROAK to EFROGS_HOLDER for betting
            const betAmount = ethers.parseEther("5");
            await croakToken.connect(croakSigner).transfer(EFROGS_HOLDER, betAmount);

            // EFROGS_HOLDER approves and bets
            await croakToken.connect(efrogsSigner).approve(await localQuest.getAddress(), betAmount);
            const tx = await localQuest.connect(efrogsSigner).bet(betAmount);
            const receipt = await tx.wait();

            const betRequestedEvent = receipt.logs.find((log: any) => {
                try {
                    return localQuest.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "BetRequested";
                } catch {
                    return false;
                }
            });
            expect(betRequestedEvent).to.not.be.undefined;

            const requestId = localQuest.interface.parseLog({
                topics: [...betRequestedEvent.topics],
                data: betRequestedEvent.data
            })!.args[0];

            // Fulfill random words and check NFT bonus
            const txFulfill = await vrfCoordinator.fulfillRandomWords(requestId, await localQuest.getAddress());
            const receiptFulfill = await txFulfill.wait();

            const betEvent = receiptFulfill.logs.find((log: any) => {
                try {
                    return localQuest.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "Bet";
                } catch {
                    return false;
                }
            });
            const decodedBet = localQuest.interface.parseLog({
                topics: [...betEvent.topics],
                data: betEvent.data
            });
            const [, , , nftBonus] = decodedBet!.args;

            expect(nftBonus).to.be.true;
        });
    });

    describe("WalletManager Integration on Linea Mainnet Fork", function () {
        let walletManager: WalletManager;
        let originalFetch: typeof global.fetch;

        beforeEach(async function () {
            originalFetch = global.fetch;
            await ethers.provider.send("hardhat_setBalance", [EFROGS_HOLDER, "0x1000000000000000000"]);
            const efrogsSigner = await ethers.getImpersonatedSigner(EFROGS_HOLDER);

            walletManager = new WalletManager();
            walletManager.provider = ethers.provider as any;
            walletManager.signer = efrogsSigner as any;
            walletManager.initializeContracts(CROAK_QUEST_DEPLOYED_ADDRESS, CROAK_TOKEN_ADDRESS, EFROGS_NFT_ADDRESS);
        });

        afterEach(function () {
            global.fetch = originalFetch;
        });

        it("Should correctly fetch token balance and NFT metadata from mainnet fork", async function () {
            const balance = await walletManager.getTokenBalance(EFROGS_HOLDER);
            expect(balance).to.be.a("bigint");

            let requestedUrl = "";
            global.fetch = (async (url: string) => {
                requestedUrl = url;
                return {
                    json: async () => ({
                        name: "eFrog #1",
                        attributes: [{ trait_type: "Body Base", value: "Green Frog" }]
                    })
                } as any;
            }) as any;

            const metadata = await walletManager.getNFTMetadata(1, EFROGS_NFT_ADDRESS);
            expect(requestedUrl).to.include("https://ipfs.io/ipfs/");
            expect(metadata).to.be.an("object");
            expect(metadata.name).to.equal("eFrog #1");
        });
    });
});
