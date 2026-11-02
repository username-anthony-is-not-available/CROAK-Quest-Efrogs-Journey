import chai from "chai";

const { expect } = chai;

describe("App UI Double-Betting Prevention & Lock State", function () {
    interface UIState {
        isConnected: boolean;
        isGameInProgress: boolean;
        isTxProcessing: boolean;
    }

    function isButtonDisabled(state: UIState): boolean {
        return !state.isConnected || state.isGameInProgress || state.isTxProcessing;
    }

    function isInputDisabled(state: UIState): boolean {
        return !state.isConnected || state.isGameInProgress || state.isTxProcessing;
    }

    it("should disable play button and input when transaction is processing", function () {
        const state: UIState = {
            isConnected: true,
            isGameInProgress: false,
            isTxProcessing: true,
        };

        expect(isButtonDisabled(state)).to.be.true;
        expect(isInputDisabled(state)).to.be.true;
    });

    it("should enable play button and input when wallet is connected, no game in progress, and no tx processing", function () {
        const state: UIState = {
            isConnected: true,
            isGameInProgress: false,
            isTxProcessing: false,
        };

        expect(isButtonDisabled(state)).to.be.false;
        expect(isInputDisabled(state)).to.be.false;
    });

    it("should keep button disabled when wallet is not connected, even if tx is not processing", function () {
        const state: UIState = {
            isConnected: false,
            isGameInProgress: false,
            isTxProcessing: false,
        };

        expect(isButtonDisabled(state)).to.be.true;
        expect(isInputDisabled(state)).to.be.true;
    });

    it("should lock UI immediately on transaction request and re-enable upon tx resolution", async function () {
        let isTxProcessing = false;
        const state: UIState = {
            isConnected: true,
            isGameInProgress: false,
            get isTxProcessing() { return isTxProcessing; }
        };

        const handleBet = async (shouldFail: boolean) => {
            isTxProcessing = true;
            try {
                await new Promise(resolve => setTimeout(resolve, 10));
                if (shouldFail) {
                    throw new Error("User rejected transaction");
                }
                return { won: true };
            } finally {
                isTxProcessing = false;
            }
        };

        const betPromise = handleBet(false);
        expect(isButtonDisabled(state)).to.be.true;

        await betPromise;
        expect(isButtonDisabled(state)).to.be.false;

        const failedBetPromise = handleBet(true).catch(() => {});
        expect(isButtonDisabled(state)).to.be.true;

        await failedBetPromise;
        expect(isButtonDisabled(state)).to.be.false;
    });

    it("should handle user rejection code 4001 and reset UI state with notification message", async function () {
        let isTxProcessing = false;
        let toastMessage = "";
        let toastType = "";

        const state: UIState = {
            isConnected: true,
            isGameInProgress: false,
            get isTxProcessing() { return isTxProcessing; }
        };

        const handleWalletAction = async () => {
            isTxProcessing = true;
            try {
                const error: any = new Error("User rejected the request.");
                error.code = 4001;
                throw error;
            } catch (err: any) {
                const { normalizeWeb3Error } = await import("../src/web3/errorNormalizer.ts");
                const normalized = normalizeWeb3Error(err);
                toastType = normalized.isUserRejection ? "info" : "error";
                toastMessage = normalized.message;
            } finally {
                isTxProcessing = false;
            }
        };

        await handleWalletAction();

        expect(isButtonDisabled(state)).to.be.false;
        expect(toastType).to.equal("info");
        expect(toastMessage).to.equal("Transaction cancelled by user");
    });
});
