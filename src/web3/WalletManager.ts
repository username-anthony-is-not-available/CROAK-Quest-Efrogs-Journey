import { ethers, BrowserProvider, JsonRpcProvider, FallbackProvider, Signer, Contract } from 'ethers';
import { EventBus } from '../game/EventBus';
import { CroakQuestEfrogsJourney, MockERC20, MockERC721 } from '../../typechain-types';
import CroakQuestEfrogsJourneyABI from './CroakQuestEfrogsJourneyABI.json';
import IERC20_ABI from './IERC20_ABI.json';
import IERC721Enumerable_ABI from './IERC721Enumerable_ABI.json';

const LINEA_RPC_URLS = [
    'https://rpc.linea.build',
    'https://linea.drpc.org',
    'https://linea.blockpi.network/v1/rpc/public',
    'https://1rpc.io/linea'
];

declare global {
    interface Window {
        ethereum: any;
    }
}

class WalletManager {
    provider: BrowserProvider | null = null;
    signer: Signer | null = null;
    croakQuestEfrogsJourney: CroakQuestEfrogsJourney | null = null;
    token: MockERC20 | null = null;
    efrogsNFT: MockERC721 | null = null;
    lineaChainId: string = '0xe708'; // Linea Mainnet Chain ID (59144 in decimal)
    readProvider: FallbackProvider;

    constructor() {
        const providers = LINEA_RPC_URLS.map(url => new JsonRpcProvider(url));
        this.readProvider = new FallbackProvider(providers);
    }

    async connectWallet() {
        if (window.ethereum == null) {
            throw new Error("MetaMask not installed!");
        }

        this.provider = new BrowserProvider(window.ethereum);
        await this.provider.send("eth_requestAccounts", []);
        this.signer = await this.provider.getSigner();

        // Check if the user is on the Linea network
        await this.checkAndSwitchToLinea();

        return this.signer;
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
                    } catch (addError) {
                        throw new Error("Failed to add Linea network");
                    }
                } else {
                    throw new Error("Failed to switch to Linea network");
                }
            }

            // Refresh provider and signer after network switch
            this.provider = new BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
        }
    }

    initializeContracts(bettingGameAddress: string, tokenAddress: string, efrogsNFTAddress: string) {
        if (!this.signer) {
            throw new Error("Wallet not connected");
        }
        this.croakQuestEfrogsJourney = new Contract(bettingGameAddress, CroakQuestEfrogsJourneyABI, this.signer) as unknown as CroakQuestEfrogsJourney;
        this.token = new Contract(tokenAddress, IERC20_ABI, this.signer) as unknown as MockERC20;
        this.efrogsNFT = new Contract(efrogsNFTAddress, IERC721Enumerable_ABI, this.signer) as unknown as MockERC721;
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

            if (onTxSent) {
                onTxSent(betTx);
            }

            const receipt = await betTx.wait();
            if (!receipt) throw new Error("Transaction receipt not found");

            // Find the Bet event in the transaction receipt
            const betEvent = receipt.logs.find(
                log => log.topics[0] === ethers.id("Bet(address,uint256,bool,bool)")
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
            if (error.message && error.message.includes("Ledger Device is busy")) {
                console.error("Ledger device is busy. Please ensure it's unlocked and the correct app is open.");
            } else {
                console.error("An error occurred while placing the bet:", error);
            }
            throw error;
        }
    }

    async getFirstNFTId(contractAddress: string) {
        if (!this.signer) throw new Error("Wallet not connected");
        const contract = new Contract(contractAddress, IERC721Enumerable_ABI, this.readProvider);
        const walletAddress = await this.signer.getAddress()
        const balance = await contract.balanceOf(walletAddress);
        if (balance !== 0n) {
            return await contract.tokenOfOwnerByIndex(walletAddress, 0);
        } else {
            throw new Error('No NFTs found in the wallet');
        }
    }

    async getTokenBalance(walletAddress: string) {
        if (!this.token) {
            throw new Error("Token contract not initialized");
        }
        const contract = this.token.connect(this.readProvider) as MockERC20;
        return await contract.balanceOf(walletAddress);
    }

    async getTokenAllowance(owner: string, spender: string) {
        if (!this.token) {
            throw new Error("Token contract not initialized");
        }
        const contract = this.token.connect(this.readProvider) as MockERC20;
        return await contract.allowance(owner, spender);
    }

    async getNFTContractData() {
        if (!this.efrogsNFT) {
            throw new Error("Contracts not initialized");
        }
        return this.efrogsNFT.connect(this.readProvider) as MockERC721;
    }

    async getNFTMetadata(tokenId: bigint) {
        const contract = await this.getNFTContractData()
        const tokenURI = await contract.tokenURI(tokenId);
        const response = await fetch(tokenURI);
        const metadata = await response.json();
        return metadata;
    }

    async getBodyBaseProperty(contractAddress: string) {
        try {
            const tokenId = await this.getFirstNFTId(contractAddress);
            const metadata = await this.getNFTMetadata(tokenId);
            const bodyBase = metadata.attributes.find((attr: any) => attr.trait_type === 'Body Base');
            return bodyBase ? bodyBase.value : 'Not found';
        } catch {
            return 'Not found';
        }
    }
}

export default WalletManager;
