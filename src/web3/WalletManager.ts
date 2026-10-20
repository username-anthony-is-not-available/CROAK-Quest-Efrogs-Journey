import { ethers } from 'ethers';
import { EventBus } from '../game/EventBus.ts';
import type { CroakQuestEfrogsJourney, MockERC20, MockERC721 } from '../../typechain-types';
import CroakQuestEfrogsJourneyABI from './CroakQuestEfrogsJourneyABI.json' with { type: 'json' };
import IERC20_ABI from './IERC20_ABI.json' with { type: 'json' };
import IERC721_ABI from './IERC721_ABI.json' with { type: 'json' };
import IERC721Enumerable_ABI from './IERC721Enumerable_ABI.json' with { type: 'json' };
import { normalizeWeb3Error, isUserRejectionError } from './errorNormalizer.ts';

const LINEA_RPC_URLS = [
    'https://rpc.linea.build',
    'https://linea.drpc.org',
    'https://linea.blockpi.network/v1/rpc/public',
    'https://1rpc.io/linea'
];

export const PENDING_TX_STORAGE_KEY = 'croak_quest_pending_tx';
export const PENDING_TX_TTL_MS = 30 * 60 * 1000; // 30 minutes

declare global {
    interface Window {
        ethereum: any;
    }
}

class WalletManager {
    provider: ethers.BrowserProvider | null = null;
    signer: ethers.Signer | null = null;
    croakQuestEfrogsJourney: CroakQuestEfrogsJourney | null = null;
    token: MockERC20 | null = null;
    efrogsNFT: MockERC721 | null = null;
    nftContract: MockERC721 | null = null;
    nftAddress: string | null = null;
    lineaChainId: string = '0xe708'; // Linea Mainnet Chain ID (59144 in decimal)
    readProvider: ethers.FallbackProvider;

    constructor() {
        const providers = LINEA_RPC_URLS.map(url => new ethers.JsonRpcProvider(url));
        this.readProvider = new ethers.FallbackProvider(providers);
    }

    async connectWallet() {
        if (window.ethereum == null) {
            throw normalizeWeb3Error(new Error("MetaMask not installed!"));
        }

        try {
            this.provider = new ethers.BrowserProvider(window.ethereum);
            await this.provider.send("eth_requestAccounts", []);
            this.signer = await this.provider.getSigner();

            // Check if the user is on the Linea network
            await this.checkAndSwitchToLinea();

            return this.signer;
        } catch (error: any) {
            throw normalizeWeb3Error(error);
        }
    }

    async checkAndSwitchToLinea() {
        if (!this.provider || !window.ethereum) return;

        const network = await this.provider.getNetwork();
        const chainId = network.chainId;

        if (chainId.toString() !== BigInt(this.lineaChainId).toString()) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: this.lineaChainId }],
                });
            } catch (switchError: any) {
                if (isUserRejectionError(switchError)) {
                    throw normalizeWeb3Error(switchError);
                }
                // This error code indicates that the chain has not been added to MetaMask.
                if (switchError.code === 4902) {
                    try {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: this.lineaChainId,
                                chainName: 'Linea Mainnet',
                                nativeCurrency: {
                                    name: 'Ether',
                                    symbol: 'ETH',
                                    decimals: 18
                                },
                                rpcUrls: LINEA_RPC_URLS,
                                blockExplorerUrls: ['https://lineascan.build']
                            }],
                        });
                    } catch (addError: any) {
                        if (isUserRejectionError(addError)) {
                            throw normalizeWeb3Error(addError);
                        }
                        throw normalizeWeb3Error(new Error("Failed to add Linea network"));
                    }
                } else {
                    throw normalizeWeb3Error(new Error("Failed to switch to Linea network"));
                }
            }

            // Refresh provider and signer after network switch
            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
        }
    }

    /**
     * Initializes core betting, token, and optional NFT contract instances.
     * @param bettingGameAddress - Address of the CroakQuestEfrogsJourney contract.
     * @param tokenAddress - Address of the ERC20 token contract.
     * @param nftCollectionAddress - Optional address of the NFT collection contract.
     */
    initializeContracts(bettingGameAddress: string, tokenAddress: string, nftCollectionAddress: string | null = null) {
        if (!this.signer) {
            throw new Error("Wallet not connected");
        }
        this.croakQuestEfrogsJourney = new ethers.Contract(bettingGameAddress, CroakQuestEfrogsJourneyABI, this.signer) as unknown as CroakQuestEfrogsJourney;
        this.token = new ethers.Contract(tokenAddress, IERC20_ABI, this.signer) as unknown as MockERC20;

        this.nftAddress = nftCollectionAddress;
        if (nftCollectionAddress) {
            const nftInst = new ethers.Contract(nftCollectionAddress, IERC721_ABI, this.signer) as unknown as MockERC721;
            this.efrogsNFT = nftInst;
            this.nftContract = nftInst;
        } else {
            this.efrogsNFT = null;
            this.nftContract = null;
        }

        console.log(`[WalletManager] Contracts initialized with Betting: ${bettingGameAddress}, Token: ${tokenAddress}, NFT: ${nftCollectionAddress}`);
    }

    async placeBet(amount: number, onTxSent?: (tx: any) => void) {
        if (!this.croakQuestEfrogsJourney || !this.token) {
            throw new Error("Contracts not initialized");
        }

        try {
            await this.checkAndSwitchToLinea();

            const parsedAmount = ethers.parseUnits(amount.toString(), 18);
            const approvalTx = await this.token.approve(await this.croakQuestEfrogsJourney.getAddress(), parsedAmount);
            await approvalTx.wait();
            const betTx = await this.croakQuestEfrogsJourney.bet(parsedAmount);

            this.savePendingTransaction(betTx.hash, amount);

            if (onTxSent) {
                onTxSent(betTx);
            }

            const receipt = await betTx.wait();
            this.clearPendingTransaction();
            if (!receipt) throw new Error("Transaction receipt not found");

            // Find the Bet event in the transaction receipt
            const betEvent = receipt.logs.find(
                (log: any) => log.topics[0] === ethers.id("Bet(address,uint256,bool,bool)")
            );

            if (betEvent) {
                const decodedEvent = this.croakQuestEfrogsJourney.interface.parseLog({
                    topics: [...betEvent.topics],
                    data: betEvent.data
                });

                if (!decodedEvent) throw new Error("Failed to decode Bet event");

                // Extract event data
                const [player, betAmount, won, nftBonus] = decodedEvent.args;

                EventBus.emit('wallet-balance-changed', player);
                if (won) {
                    EventBus.emit('reward-payout', { player, amount: betAmount });
                }

                return {
                    transactionHash: receipt.hash,
                    player: player,
                    amount: ethers.formatUnits(betAmount, 18), // Convert back to decimal
                    won: won,
                    nftBonus: nftBonus
                };
            } else {
                console.warn("Bet event not found in transaction logs");
                return { transactionHash: receipt.hash, won: false };
            }
        } catch (error: any) {
            if (error?.message && error.message.includes("Ledger Device is busy")) {
                console.error("Ledger device is busy. Please ensure it's unlocked and the correct app is open.");
            }
            throw normalizeWeb3Error(error);
        }
    }

    savePendingTransaction(txHash: string, amount: number) {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            const data = {
                txHash,
                amount,
                timestamp: Date.now()
            };
            window.localStorage.setItem(PENDING_TX_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.warn("Failed to save pending transaction to localStorage:", error);
        }
    }

    clearPendingTransaction() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            window.localStorage.removeItem(PENDING_TX_STORAGE_KEY);
        } catch (error) {
            console.warn("Failed to clear pending transaction from localStorage:", error);
        }
    }

    getPendingTransaction(): { txHash: string; amount: number; timestamp: number } | null {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return null;
            const raw = window.localStorage.getItem(PENDING_TX_STORAGE_KEY);
            if (!raw) return null;

            const data = JSON.parse(raw);
            if (!data || !data.txHash || typeof data.timestamp !== 'number') {
                this.clearPendingTransaction();
                return null;
            }

            if (Date.now() - data.timestamp > PENDING_TX_TTL_MS) {
                console.log("[Recovery] Pending transaction expired (TTL > 30m), clearing.");
                this.clearPendingTransaction();
                return null;
            }

            return data;
        } catch (error) {
            this.clearPendingTransaction();
            return null;
        }
    }

    async recoverPendingTransaction() {
        const pending = this.getPendingTransaction();
        if (!pending) return null;

        console.log(`[Recovery] Pending transaction found: ${pending.txHash}`);

        const provider = this.provider || this.readProvider;
        if (!provider) return null;

        try {
            const receipt = await provider.getTransactionReceipt(pending.txHash);
            if (!receipt) {
                return null;
            }

            this.clearPendingTransaction();

            const contractInterface = this.croakQuestEfrogsJourney?.interface || new ethers.Interface(CroakQuestEfrogsJourneyABI);

            const betEvent = receipt.logs.find(
                (log: any) => log.topics[0] === ethers.id("Bet(address,uint256,bool,bool)")
            );

            if (betEvent) {
                const decodedEvent = contractInterface.parseLog({
                    topics: [...betEvent.topics],
                    data: betEvent.data
                });

                if (decodedEvent) {
                    const [player, betAmount, won, nftBonus] = decodedEvent.args;

                    EventBus.emit('wallet-balance-changed', player);
                    if (won) {
                        EventBus.emit('reward-payout', { player, amount: betAmount });
                    }

                    return {
                        transactionHash: receipt.hash,
                        player,
                        amount: ethers.formatUnits(betAmount, 18),
                        won,
                        nftBonus,
                        recovered: true
                    };
                }
            }

            return {
                transactionHash: receipt.hash,
                won: false,
                recovered: true
            };
        } catch (error) {
            console.error("Failed to recover pending transaction:", error);
            return null;
        }
    }

    async getFirstNFTId(contractAddress: string) {
        if (!this.signer) throw normalizeWeb3Error(new Error("Wallet not connected"));
        try {
            const contract = new ethers.Contract(contractAddress, IERC721_ABI, this.readProvider);
            const walletAddress = await this.signer.getAddress();
            const balance = await contract.balanceOf(walletAddress);
            if (balance !== 0n) {
                return await contract.tokenOfOwnerByIndex(walletAddress, 0);
            } else {
                throw new Error('No NFTs found in the wallet');
            }
        } catch (error: any) {
            throw normalizeWeb3Error(error);
        }
    }

    async getTokenBalance(walletAddress: string) {
        if (!this.token) {
            throw normalizeWeb3Error(new Error("Token contract not initialized"));
        }
        try {
            const contract = this.token.connect(this.readProvider) as MockERC20;
            return await contract.balanceOf(walletAddress);
        } catch (error: any) {
            throw normalizeWeb3Error(error);
        }
    }

    async getTokenAllowance(owner: string, spender: string) {
        if (!this.token) {
            throw normalizeWeb3Error(new Error("Token contract not initialized"));
        }
        try {
            const contract = this.token.connect(this.readProvider) as MockERC20;
            return await contract.allowance(owner, spender);
        } catch (error: any) {
            throw normalizeWeb3Error(error);
        }
    }

    async getNFTContractData(contractAddress?: string) {
        if (contractAddress) {
            return new ethers.Contract(contractAddress, IERC721_ABI, this.readProvider);
        }
        const nftInst = this.efrogsNFT || this.nftContract;
        if (!nftInst) {
            throw new Error("Contracts not initialized");
        }
        return nftInst.connect(this.readProvider) as MockERC721;
    }

    async getNFTMetadata(tokenId: bigint | number | string, contractAddress?: string) {
        try {
            const contract = await this.getNFTContractData(contractAddress);
            const tokenURI: string = await contract.tokenURI(tokenId);
            const url = tokenURI.startsWith('ipfs://')
                ? tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/')
                : tokenURI;
            const response = await fetch(url);
            const metadata = await response.json();
            return metadata;
        } catch (error: any) {
            throw normalizeWeb3Error(error);
        }
    }

    async getBodyBaseProperty(contractAddress: string) {
        try {
            const tokenId = await this.getFirstNFTId(contractAddress);
            const metadata = await this.getNFTMetadata(tokenId, contractAddress);
            const bodyBase = metadata?.attributes?.find((attr: any) => attr.trait_type === 'Body Base');
            const traitValue = bodyBase ? bodyBase.value : 'Not found';
            console.log(`[NFT] Detected token ID: ${tokenId}, Body Base: ${traitValue}`);
            return traitValue;
        } catch {
            return 'Not found';
        }
    }
}

export default WalletManager;
