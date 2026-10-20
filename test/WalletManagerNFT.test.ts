import chai from "chai";
import hre from "hardhat";
import WalletManager from "../src/web3/WalletManager.ts";

const { expect } = chai;
const { ethers } = hre;

describe("WalletManager NFT Methods", function () {
    let walletManager: WalletManager;
    let nftContract: any;
    let owner: any;
    let nonOwner: any;
    let originalFetch: typeof global.fetch;

    beforeEach(async function () {
        [owner, nonOwner] = await ethers.getSigners();
        originalFetch = global.fetch;

        const nftFactory = await ethers.getContractFactory("MockERC721");
        nftContract = await nftFactory.deploy("Mock NFT", "MNFT");

        walletManager = new WalletManager();
        walletManager.signer = owner;
        walletManager.readProvider = ethers.provider as any;
    });

    afterEach(function () {
        global.fetch = originalFetch;
    });

    describe("initializeContracts", function () {
        it("should initialize all 3 contract instances and store nftAddress when 3 parameters are provided", async function () {
            const bettingAddr = ethers.Wallet.createRandom().address;
            const tokenAddr = ethers.Wallet.createRandom().address;
            const nftAddr = await nftContract.getAddress();

            walletManager.initializeContracts(bettingAddr, tokenAddr, nftAddr);

            expect(walletManager.croakQuestEfrogsJourney).to.not.be.null;
            expect(walletManager.token).to.not.be.null;
            expect(walletManager.efrogsNFT).to.not.be.null;
            expect(walletManager.nftContract).to.not.be.null;
            expect(walletManager.nftAddress).to.equal(nftAddr);
            expect(await walletManager.efrogsNFT?.getAddress()).to.equal(nftAddr);
            expect(await walletManager.nftContract?.getAddress()).to.equal(nftAddr);
        });

        it("should initialize core contracts without error when optional NFT address is omitted", async function () {
            const bettingAddr = ethers.Wallet.createRandom().address;
            const tokenAddr = ethers.Wallet.createRandom().address;

            walletManager.initializeContracts(bettingAddr, tokenAddr);

            expect(walletManager.croakQuestEfrogsJourney).to.not.be.null;
            expect(walletManager.token).to.not.be.null;
            expect(walletManager.efrogsNFT).to.be.null;
            expect(walletManager.nftContract).to.be.null;
            expect(walletManager.nftAddress).to.be.null;
        });

        it("should throw an error when signer is not set", function () {
            walletManager.signer = null;
            const bettingAddr = ethers.Wallet.createRandom().address;
            const tokenAddr = ethers.Wallet.createRandom().address;

            expect(() => walletManager.initializeContracts(bettingAddr, tokenAddr))
                .to.throw("Wallet not connected");
        });
    });

    describe("checkAndSwitchToLinea rejection handling", function () {
        it("should detect and normalize user rejection error (code 4001) during network switch", async function () {
            walletManager.provider = {
                getNetwork: async () => ({ chainId: 1n })
            } as any;

            const fakeEthereum = {
                request: async ({ method }: { method: string }) => {
                    if (method === 'wallet_switchEthereumChain') {
                        const err: any = new Error("User rejected the request.");
                        err.code = 4001;
                        throw err;
                    }
                }
            };
            (global as any).window = { ethereum: fakeEthereum };

            try {
                await walletManager.checkAndSwitchToLinea();
                expect.fail("Should have thrown error");
            } catch (error: any) {
                expect(error.isUserRejection).to.be.true;
                expect(error.code).to.equal("USER_REJECTED");
                expect(error.message).to.equal("Transaction cancelled by user");
            } finally {
                delete (global as any).window;
            }
        });
    });

    describe("getFirstNFTId", function () {
        it("should return the correct token ID when wallet owns an NFT", async function () {
            const contractAddress = await nftContract.getAddress();
            await nftContract.mint(owner.address, 42);

            const tokenId = await walletManager.getFirstNFTId(contractAddress);
            expect(tokenId).to.equal(42n);
        });

        it("should throw an error when wallet owns no NFTs", async function () {
            const contractAddress = await nftContract.getAddress();
            walletManager.signer = nonOwner;

            await expect(walletManager.getFirstNFTId(contractAddress))
                .to.be.rejectedWith('No NFTs found in the wallet');
        });
    });

    describe("getNFTMetadata", function () {
        it("should fetch metadata and call tokenURI on NFT contract without errors", async function () {
            const contractAddress = await nftContract.getAddress();
            await nftContract.mintWithTokenURI(owner.address, 101, "https://example.com/101.json");

            let fetchedUrl = "";
            global.fetch = (async (url: string) => {
                fetchedUrl = url;
                return {
                    json: async () => ({
                        name: "eFrog #101",
                        attributes: [{ trait_type: "Body Base", value: "Golden Frog" }]
                    })
                } as any;
            }) as any;

            const metadata = await walletManager.getNFTMetadata(101n, contractAddress);
            expect(fetchedUrl).to.equal("https://example.com/101.json");
            expect(metadata.name).to.equal("eFrog #101");
            expect(metadata.attributes[0].value).to.equal("Golden Frog");
        });

        it("should translate ipfs:// protocol to https://ipfs.io/ipfs/ gateway", async function () {
            const contractAddress = await nftContract.getAddress();
            await nftContract.mintWithTokenURI(owner.address, 102, "ipfs://QmTestHash123");

            let fetchedUrl = "";
            global.fetch = (async (url: string) => {
                fetchedUrl = url;
                return {
                    json: async () => ({
                        name: "eFrog #102",
                        attributes: []
                    })
                } as any;
            }) as any;

            await walletManager.getNFTMetadata(102n, contractAddress);
            expect(fetchedUrl).to.equal("https://ipfs.io/ipfs/QmTestHash123");
        });
    });

    describe("getBodyBaseProperty", function () {
        it("should return the Body Base trait value when NFT is owned and metadata contains it", async function () {
            const contractAddress = await nftContract.getAddress();
            await nftContract.mintWithTokenURI(owner.address, 77, "https://example.com/77.json");

            global.fetch = (async () => {
                return {
                    json: async () => ({
                        attributes: [
                            { trait_type: "Background", value: "Swamp" },
                            { trait_type: "Body Base", value: "Tree Frog Green" }
                        ]
                    })
                } as any;
            }) as any;

            const bodyBase = await walletManager.getBodyBaseProperty(contractAddress);
            expect(bodyBase).to.equal("Tree Frog Green");
        });

        it("should return 'Not found' without throwing when wallet owns no NFTs", async function () {
            const contractAddress = await nftContract.getAddress();
            walletManager.signer = nonOwner;

            const bodyBase = await walletManager.getBodyBaseProperty(contractAddress);
            expect(bodyBase).to.equal("Not found");
        });

        it("should return 'Not found' when metadata does not contain Body Base trait", async function () {
            const contractAddress = await nftContract.getAddress();
            await nftContract.mintWithTokenURI(owner.address, 88, "https://example.com/88.json");

            global.fetch = (async () => {
                return {
                    json: async () => ({
                        attributes: [
                            { trait_type: "Hat", value: "Crown" }
                        ]
                    })
                } as any;
            }) as any;

            const bodyBase = await walletManager.getBodyBaseProperty(contractAddress);
            expect(bodyBase).to.equal("Not found");
        });
    });
});
