import chai from "chai";
import hre from "hardhat";
import WalletManager, { PENDING_TX_STORAGE_KEY, PENDING_TX_TTL_MS } from "../src/web3/WalletManager.ts";
import { EventBus } from "../src/game/EventBus.ts";

const { expect } = chai;
const { ethers } = hre;

class LocalStorageMock {
    private store: Record<string, string> = {};

    clear() {
        this.store = {};
    }

    getItem(key: string) {
        return this.store[key] || null;
    }

    setItem(key: string, value: string) {
        this.store[key] = String(value);
    }

    removeItem(key: string) {
        delete this.store[key];
    }
}

describe("WalletManager Transaction Recovery", function () {
    let walletManager: WalletManager;
    let croakQuest: any;
    let token: any;
    let nft: any;
    let vrfCoordinator: any;
    let owner: any;
    let player1: any;
    let mockLocalStorage: LocalStorageMock;

    const initialFunds = ethers.parseEther("1000");
    const BASE_FEE = ethers.parseEther("0.1");
    const GAS_PRICE_LINK = ethers.parseUnits("1", "gwei");
    const KEY_HASH = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";
    const CALLBACK_GAS_LIMIT = 1000000;
    let subId: bigint;

    beforeEach(async function () {
        [owner, player1] = await ethers.getSigners();

        mockLocalStorage = new LocalStorageMock();
        (global as any).window = {
            localStorage: mockLocalStorage
        };

        // Deploy contracts
        const vrfFactory = await ethers.getContractFactory("VRFCoordinatorV2MockProxy");
        vrfCoordinator = await vrfFactory.deploy(BASE_FEE, GAS_PRICE_LINK);

        const txSub = await vrfCoordinator.createSubscription();
        const receiptSub = await txSub.wait();
        const subEvent = receiptSub?.logs.find(log => {
            try {
                const parsed = vrfCoordinator.interface.parseLog({ topics: [...log.topics], data: log.data });
                return parsed?.name === 'SubscriptionCreated';
            } catch {
                return false;
            }
        });
        subId = vrfCoordinator.interface.parseLog({ topics: [...subEvent!.topics], data: subEvent!.data })!.args[0];
        await vrfCoordinator.fundSubscription(subId, ethers.parseEther("10"));

        const tokenFactory = await ethers.getContractFactory("MockERC20");
        token = await tokenFactory.deploy("Mock Token", "MTK");

        const nftFactory = await ethers.getContractFactory("MockERC721");
        nft = await nftFactory.deploy("Mock NFT", "MNFT");

        const croakQuestFactory = await ethers.getContractFactory("CroakQuestEfrogsJourney");
        croakQuest = await croakQuestFactory.deploy(
            await token.getAddress(),
            await nft.getAddress(),
            await vrfCoordinator.getAddress(),
            subId,
            KEY_HASH,
            CALLBACK_GAS_LIMIT
        );

        await vrfCoordinator.addConsumer(subId, await croakQuest.getAddress());

        await token.mint(player1.address, initialFunds);
        await token.mint(owner.address, initialFunds);
        await token.connect(owner).approve(await croakQuest.getAddress(), initialFunds);
        await croakQuest.addFunds(initialFunds);

        walletManager = new WalletManager();
        walletManager.provider = ethers.provider as any;
        walletManager.signer = player1;
        walletManager.readProvider = ethers.provider as any;
        walletManager.checkAndSwitchToLinea = async () => {}; // Bypass network switch in test

        walletManager.croakQuestEfrogsJourney = croakQuest.connect(player1) as any;
        walletManager.token = token.connect(player1) as any;
        walletManager.efrogsNFT = nft.connect(player1) as any;
    });

    describe("LocalStorage helper methods", function () {
        it("should save pending transaction to localStorage", function () {
            const txHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
            walletManager.savePendingTransaction(txHash, 10);

            const saved = walletManager.getPendingTransaction();
            expect(saved).to.not.be.null;
            expect(saved?.txHash).to.equal(txHash);
            expect(saved?.amount).to.equal(10);
            expect(saved?.timestamp).to.be.a('number');
        });

        it("should clear pending transaction from localStorage", function () {
            const txHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
            walletManager.savePendingTransaction(txHash, 10);
            expect(walletManager.getPendingTransaction()).to.not.be.null;

            walletManager.clearPendingTransaction();
            expect(walletManager.getPendingTransaction()).to.be.null;
        });

        it("should clear and return null for expired transaction (TTL > 30 minutes)", function () {
            const txHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
            const expiredTimestamp = Date.now() - (PENDING_TX_TTL_MS + 1000);

            mockLocalStorage.setItem(PENDING_TX_STORAGE_KEY, JSON.stringify({
                txHash,
                amount: 10,
                timestamp: expiredTimestamp
            }));

            const result = walletManager.getPendingTransaction();
            expect(result).to.be.null;
            expect(mockLocalStorage.getItem(PENDING_TX_STORAGE_KEY)).to.be.null;
        });
    });

    describe("recoverPendingTransaction", function () {
        it("should return null if no pending transaction exists in localStorage", async function () {
            const recovered = await walletManager.recoverPendingTransaction();
            expect(recovered).to.be.null;
        });

        it("should return null if receipt is not yet mined", async function () {
            const fakeTxHash = "0x0000000000000000000000000000000000000000000000000000000000001234";
            walletManager.savePendingTransaction(fakeTxHash, 5);

            const recovered = await walletManager.recoverPendingTransaction();
            expect(recovered).to.be.null;
            // localStorage should still keep the pending transaction while unmined
            expect(walletManager.getPendingTransaction()).to.not.be.null;
        });

        it("should recover outcome and clear localStorage for a mined bet transaction", async function () {
            await token.connect(player1).approve(await croakQuest.getAddress(), ethers.parseEther("10"));

            // Set high win chance to ensure win
            await croakQuest.connect(owner).setWinChance(99);

            const tx = await croakQuest.connect(player1).bet(ethers.parseEther("10"));
            const receipt = await tx.wait();

            // Fulfill VRF to emit Bet event
            const betRequestedEvent = receipt.logs.find((l: any) => {
                try { return croakQuest.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === 'BetRequested'; } catch { return false; }
            });
            const decodedReq = croakQuest.interface.parseLog({ topics: [...betRequestedEvent.topics], data: betRequestedEvent.data });
            const requestId = decodedReq!.args[0];

            const txFulfill = await vrfCoordinator.fulfillRandomWordsWithOverride(requestId, await croakQuest.getAddress(), [0]);
            const receiptFulfill = await txFulfill.wait();

            // Save the fulfillment transaction hash as pending
            walletManager.savePendingTransaction(receiptFulfill.hash, 10);

            let eventEmitted = false;
            const listener = () => { eventEmitted = true; };
            EventBus.on('wallet-balance-changed', listener);

            const recovered = await walletManager.recoverPendingTransaction();

            EventBus.removeListener('wallet-balance-changed', listener);

            expect(recovered).to.not.be.null;
            expect(recovered?.recovered).to.be.true;
            expect(recovered?.won).to.be.true;
            expect(recovered?.transactionHash).to.equal(receiptFulfill.hash);
            expect(walletManager.getPendingTransaction()).to.be.null;
            expect(eventEmitted).to.be.true;
        });
    });

    describe("placeBet storage lifecycle", function () {
        it("should save txHash before awaiting wait() and clear after completion", async function () {
            await token.connect(player1).approve(await croakQuest.getAddress(), ethers.parseEther("10"));

            let txSavedDuringCallback = false;
            const onTxSent = (tx: any) => {
                const pending = walletManager.getPendingTransaction();
                if (pending && pending.txHash === tx.hash && pending.amount === 10) {
                    txSavedDuringCallback = true;
                }
            };

            const result = await walletManager.placeBet(10, onTxSent);

            expect(txSavedDuringCallback).to.be.true;
            expect(walletManager.getPendingTransaction()).to.be.null;
            expect(result.transactionHash).to.be.a('string');
        });
    });
});
