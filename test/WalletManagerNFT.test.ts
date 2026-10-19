if (typeof globalThis.HTMLVideoElement === 'undefined') {
    (globalThis as any).HTMLVideoElement = class HTMLVideoElement {};
}
if (typeof globalThis.window === 'undefined') {
    (globalThis as any).window = globalThis;
}

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
