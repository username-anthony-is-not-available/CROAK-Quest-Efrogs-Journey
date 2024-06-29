import { ethers } from 'ethers';
import CroakQuestEfrogsJourneyABI from './CroakQuestEfrogsJourneyABI.json' with { type: "json" };
import IERC20_ABI from './IERC20_ABI.json' with { type: "json" };

class WalletManager {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.croakQuestEfrogsJourney = null;
        this.token = null;
        this.lineaChainId = '0xe708'; // Linea Mainnet Chain ID (59144 in decimal)
    }

    async connectWallet() {
        if (window.ethereum == null) {
            throw new Error("MetaMask not installed!");
        }

        this.provider = new ethers.BrowserProvider(window.ethereum);
        await this.provider.send("eth_requestAccounts", []);
        this.signer = await this.provider.getSigner();

        // Check if the user is on the Linea network
        await this.checkAndSwitchToLinea();

        return this.signer;
    }

    async checkAndSwitchToLinea() {
        const chainId = await this.provider.getNetwork().then(network => network.chainId);

        if (chainId.toString() !== this.lineaChainId) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: this.lineaChainId }],
                });
            } catch (switchError) {
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
                                rpcUrls: ['https://rpc.linea.build'],
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
            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
        }
    }

    initializeContracts(bettingGameAddress, tokenAddress) {
        if (!this.signer) {
            throw new Error("Wallet not connected");
        }
        this.croakQuestEfrogsJourney = new ethers.Contract(bettingGameAddress, CroakQuestEfrogsJourneyABI, this.signer);
        this.token = new ethers.Contract(tokenAddress, IERC20_ABI, this.signer);
    }

    async placeBet(amount) {
        if (!this.croakQuestEfrogsJourney || !this.token) {
            throw new Error("Contracts not initialized");
        }

        try {
            await this.checkAndSwitchToLinea();

            const parsedAmount = ethers.parseUnits(amount.toString(), 18);
            const approvalTx = await this.token.approve(await this.croakQuestEfrogsJourney.getAddress(), parsedAmount);
            await approvalTx.wait();
            const betTx = await this.croakQuestEfrogsJourney.bet(parsedAmount);
            const receipt = await betTx.wait();

            // Find the Bet event in the transaction receipt
            const betEvent = receipt.logs.find(
                log => log.topics[0] === ethers.id("Bet(address,uint256,bool,bool)")
            );

            if (betEvent) {
                const decodedEvent = this.croakQuestEfrogsJourney.interface.parseLog({
                    topics: betEvent.topics,
                    data: betEvent.data
                });

                // Extract event data
                const [player, betAmount, won, nftBonus] = decodedEvent.args;

                return {
                    transactionHash: receipt.transactionHash,
                    player: player,
                    amount: ethers.formatUnits(betAmount, 18), // Convert back to decimal
                    won: won,
                    nftBonus: nftBonus
                };
            } else {
                console.warn("Bet event not found in transaction logs");
                return { transactionHash: receipt.transactionHash };
            }
        } catch (error) {
            if (error.message.includes("Ledger Device is busy")) {
                console.error("Ledger device is busy. Please ensure it's unlocked and the correct app is open.");
                // You can also show this message to the user in your UI
            } else {
                console.error("An error occurred while placing the bet:", error);
            }
            throw error; // Re-throw the error if you want calling code to handle it
        }
    }

    async getFirstNFTId(contractAddress) {
        const contract = new ethers.Contract(contractAddress, IERC20_ABI, this.provider);
        const walletAddress = await this.signer.getAddress()
        const balance = await contract.balanceOf(walletAddress);
        if (balance !== 0n) {
            return await contract.tokenOfOwnerByIndex(walletAddress, 0);
        } else {
            throw new Error('No NFTs found in the wallet');
        }
    }

    async getNFTMetadata(tokenId) {
        const contract = await this.getNFTContractData()
        const tokenURI = await contract.tokenURI(tokenId);
        const response = await fetch(tokenURI);
        const metadata = await response.json();
        return metadata;
    }

    async getBodyBaseProperty(contractAddress) {
        try {
            const tokenId = await this.getFirstNFTId(contractAddress);
            const metadata = await this.getNFTMetadata(tokenId);
            const bodyBase = metadata.attributes.find(attr => attr.trait_type === 'Body Base');
            return bodyBase ? bodyBase.value : 'Not found';
        } catch {
            return 'Not found';
        }
    }
}

export default WalletManager;
