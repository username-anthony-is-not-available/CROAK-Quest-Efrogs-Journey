import { useRef, useState } from 'react';
import { PhaserGame } from "./game/PhaserGame.jsx";
import WalletManager from './web3/WalletManager.js';

const CROAKQuestContractAddress = '0xae685dbbf74a5684d25ee24d00ff33ac38b7b362';
const CROAKTokenAddress = '0xaCb54d07cA167934F57F829BeE2cC665e1A5ebEF';
const efrogsNFTAddress = '0x194395587d7b169e63eaf251e86b1892fa8f1960';

const walletManager = new WalletManager();

function App() {
    const [betAmount, setBetAmount] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [isGameInProgress, setIsGameInProgress] = useState(false);
    const [validationMessage, setValidationMessage] = useState('');
    const [efrogsNFTBodyBase, setEfrogsNFTBodyBase] = useState('');

    const connectWallet = async () => {
        try {
            await walletManager.connectWallet();
            await walletManager.initializeContracts(CROAKQuestContractAddress, CROAKTokenAddress, efrogsNFTAddress);
            setEfrogsNFTBodyBase(await walletManager.getBodyBaseProperty(efrogsNFTAddress));
            setIsConnected(true);
        } catch (error) {
            alert("Failed to connect wallet:", error);
        }
    };

    const changeScene = async () => {

        setIsGameInProgress(true);

        try {
            const betAmountInt = parseInt(betAmount, 10);

            if (isNaN(betAmountInt) || betAmountInt <= 0) {
                setValidationMessage("Please enter an amount greater than 0 to play.");
                return;
            }
            setValidationMessage('');

            const tx = await walletManager.placeBet(betAmountInt)
            const hasPlayerWon = tx.won;
            setBetAmount('');

            const scene = phaserRef.current.scene;
            if (scene && scene.scene.key !== 'Game') {
                scene.changeScene(hasPlayerWon, efrogsNFTBodyBase);
            } else {
                scene.resetGame(hasPlayerWon, efrogsNFTBodyBase);
            }
        } catch (error) {
            alert("Failed to place a bet:", error);
            setIsGameInProgress(false);
        }
    }

    // References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef();

    // Event emitted from the PhaserGame component
    const currentScene = (scene) => {
        setIsGameInProgress(scene.scene.key === 'Game');
    }

    const gameOver = () => {
        setIsGameInProgress(false)
    }

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
                    This is a <bold>demo project</bold> built for the Linea Dev Cook-Off challenge. More details at <a href="https://github.com/username-anthony-is-not-available/CROAK-Quest-Efrogs-Journey" target="_blank" rel="noopener noreferrer" className="menu-link">here</a>.
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
                    disabled={!isConnected || isGameInProgress}
                />
                {validationMessage && <p style={{ color: 'red' }}>{validationMessage}</p>}
                <button className="form-element" onClick={changeScene} disabled={!isConnected || isGameInProgress}>
                    Play Now
                </button>
            </div>
        </div>
    )
}

export default App
