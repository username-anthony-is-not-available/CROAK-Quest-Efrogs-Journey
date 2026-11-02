import { useRef, useState, useCallback, useEffect } from 'react';
import { PhaserGame, IPhaserGameRef } from "./game/PhaserGame";
import { EventBus } from './game/EventBus';
import WalletManager from './web3/WalletManager';
import { normalizeWeb3Error } from './web3/errorNormalizer';

const CROAKQuestContractAddress = '0xae685dbbf74a5684d25ee24d00ff33ac38b7b362';
const CROAKTokenAddress = '0xaCb54d07cA167934F57F829BeE2cC665e1A5ebEF';
const efrogsNFTAddress = '0x194395587d7b169e63eaf251e86b1892fa8f1960';

const walletManager = new WalletManager();

interface NotificationToast {
    type: 'info' | 'error' | 'success';
    message: string;
}

function App() {
    const [betAmount, setBetAmount] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [isGameInProgress, setIsGameInProgress] = useState(false);
    const [isTxProcessing, setIsTxProcessing] = useState(false);
    const [validationMessage, setValidationMessage] = useState('');
    const [efrogsNFTBodyBase, setEfrogsNFTBodyBase] = useState('');
    const [toast, setToast] = useState<NotificationToast | null>(null);

    const connectWallet = async () => {
        setToast(null);
        try {
            await walletManager.connectWallet();
            await walletManager.initializeContracts(CROAKQuestContractAddress, CROAKTokenAddress, efrogsNFTAddress);
            setEfrogsNFTBodyBase(await walletManager.getBodyBaseProperty(efrogsNFTAddress));
            setIsConnected(true);
        } catch (error: any) {
            const normalized = error?.isUserRejection !== undefined ? error : normalizeWeb3Error(error);
            setToast({
                type: normalized.isUserRejection ? 'info' : 'error',
                message: normalized.message || "Failed to connect wallet."
            });
        }
    };

    const changeScene = async () => {
        const betAmountInt = parseInt(betAmount, 10);

        if (isNaN(betAmountInt) || betAmountInt <= 0) {
            setValidationMessage("Please enter an amount greater than 0 to play.");
            return;
        }

        setValidationMessage('');
        setToast(null);
        setIsGameInProgress(true);
        setIsTxProcessing(true);

        try {
            const onTxSent = () => {
                const scene = phaserRef.current?.scene;
                // Start game optimistically
                if (scene && scene.scene.key !== 'Game') {
                    scene.changeScene(null, efrogsNFTBodyBase, true);
                } else if (scene) {
                    scene.resetGame(null, efrogsNFTBodyBase, true);
                }
                setBetAmount('');
            };

            const tx = await walletManager.placeBet(betAmountInt, onTxSent);
            const hasPlayerWon = tx.won;

            const scene = phaserRef.current?.scene;
            if (scene && scene.scene.key === 'Game') {
                scene.resolveOptimisticBet(hasPlayerWon);
            } else if (scene) {
                // If for some reason we are not in Game scene yet, we call changeScene with actual result
                scene.changeScene(hasPlayerWon, efrogsNFTBodyBase, false);
            }

        } catch (error: any) {
            const scene = phaserRef.current?.scene;
            if (scene && scene.scene.key === 'Game') {
                scene.cancelOptimisticBet();
            } else {
                setIsGameInProgress(false);
            }

            const normalized = error?.isUserRejection !== undefined ? error : normalizeWeb3Error(error);
            setToast({
                type: normalized.isUserRejection ? 'info' : 'error',
                message: normalized.message || "Failed to place a bet."
            });
        } finally {
            setIsTxProcessing(false);
        }
    };

    // References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IPhaserGameRef>(null);
    const pendingRecoveryResultRef = useRef<{ won: boolean } | null>(null);

    const handlePendingTxRecovery = useCallback((recovered: { won: boolean; amount?: string }) => {
        setToast({
            type: recovered.won ? 'success' : 'info',
            message: `Recovered transaction! Bet result: ${recovered.won ? 'WON' : 'LOST'}${recovered.amount ? ` (${recovered.amount} $CROAK)` : ''}.`
        });

        const scene = phaserRef.current?.scene;
        if (scene) {
            if (scene.scene.key !== 'Game') {
                scene.changeScene(recovered.won, efrogsNFTBodyBase, false);
            } else {
                scene.resetGame(recovered.won, efrogsNFTBodyBase, false);
            }
        } else {
            pendingRecoveryResultRef.current = { won: recovered.won };
        }
    }, [efrogsNFTBodyBase]);

    // Event emitted from the PhaserGame component
    const currentScene = useCallback((sceneKey: string) => {
        setIsGameInProgress(sceneKey === 'Game');
        if (pendingRecoveryResultRef.current) {
            const result = pendingRecoveryResultRef.current;
            pendingRecoveryResultRef.current = null;
            const scene = phaserRef.current?.scene;
            if (scene) {
                if (scene.scene.key !== 'Game') {
                    scene.changeScene(result.won, efrogsNFTBodyBase, false);
                } else {
                    scene.resetGame(result.won, efrogsNFTBodyBase, false);
                }
            }
        }
    }, [efrogsNFTBodyBase]);

    const gameOver = useCallback(() => {
        setIsGameInProgress(false);
    }, []);

    useEffect(() => {
        const handleBalanceChange = (player: string) => {
            console.log(`Wallet balance changed for ${player}`);
            // In a real app, we might trigger a balance refresh here
        };

        const handleRewardPayout = ({ player, amount }: { player: string, amount: bigint }) => {
            console.log(`Reward payout of ${amount} to ${player}`);
            // In a real app, we might show a celebration UI or notification
        };

        EventBus.on('wallet-balance-changed', handleBalanceChange);
        EventBus.on('reward-payout', handleRewardPayout);

        return () => {
            EventBus.removeListener('wallet-balance-changed', handleBalanceChange);
            EventBus.removeListener('reward-payout', handleRewardPayout);
        };
    }, []);

    useEffect(() => {
        const checkPendingTx = async () => {
            try {
                const recovered = await walletManager.recoverPendingTransaction();
                if (recovered) {
                    handlePendingTxRecovery(recovered);
                }
            } catch (error) {
                console.error("Error checking pending transaction:", error);
            }
        };

        checkPendingTx();
    }, [isConnected, handlePendingTxRecovery]);

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} onGameOver={gameOver} />
            <div id="menu">
                <h3>How to Play</h3>
                <ol>
                    <li>Connect your wallet</li>
                    <li>Choose the amount of $CROAK tokens you want to bet for a chance to win a percentage of the accumulated funds</li>
                    <li>Try your luck!</li>
                </ol>
                <h3>Important Notice</h3>
                <p>
                    This is a <b>demo project</b> built for the Linea Dev Cook-Off challenge. For more details, visit this <a href="https://github.com/username-anthony-is-not-available/CROAK-Quest-Efrogs-Journey" target="_blank" rel="noopener noreferrer" className="menu-link">GitHub repository</a>.
                </p>
                <h3>Start Playing</h3>
                <button className="form-element" onClick={connectWallet} disabled={isConnected}>
                    {isConnected ? "Wallet Connected" : "Connect Wallet"}
                </button>
                <input
                    type="text"
                    className="form-element"
                    placeholder="Enter $CROAK Amount"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    disabled={!isConnected || isGameInProgress || isTxProcessing}
                />
                {validationMessage && <p style={{ color: 'red' }}>{validationMessage}</p>}
                {toast && (
                    <div className={`toast toast-${toast.type}`} role="alert">
                        <span>{toast.message}</span>
                        <button type="button" className="toast-close-btn" onClick={() => setToast(null)} aria-label="Close notification">&times;</button>
                    </div>
                )}
                <button className="form-element" onClick={changeScene} disabled={!isConnected || isGameInProgress || isTxProcessing}>
                    {isTxProcessing ? (
                        <span className="btn-loading-container">
                            <span className="spinner" aria-hidden="true"></span>
                            Processing...
                        </span>
                    ) : (
                        "Play Now"
                    )}
                </button>
            </div>
        </div>
    )
}

export default App
