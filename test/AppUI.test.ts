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

    it("keeps active form-control text at WCAG AA contrast", async function () {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const stylesheet = readFileSync(resolve(process.cwd(), "public/style.css"), "utf8");
        const activeRule = stylesheet.match(/\.form-element:active\s*\{([^}]*)\}/);
        const rule = activeRule?.[1];
        if (!rule) {
            throw new Error("The active form-control style must be defined.");
        }

        const foregroundHex = rule.match(/(?:^|;)\s*color\s*:\s*(#[\da-f]{6})/i)?.[1];
        const backgroundHex = rule.match(/(?:^|;)\s*background-color\s*:\s*(#[\da-f]{6})/i)?.[1];
        if (!foregroundHex || !backgroundHex) {
            throw new Error("The active form-control text and background colors must be explicit hex values.");
        }

        type Rgb = readonly [number, number, number];
        const toRgb = (hex: string): Rgb => [
            parseInt(hex.slice(1, 3), 16),
            parseInt(hex.slice(3, 5), 16),
            parseInt(hex.slice(5, 7), 16),
        ];
        const linearize = (channel: number) => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        };
        const luminance = ([red, green, blue]: Rgb) =>
            0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
        const foreground = luminance(toRgb(foregroundHex));
        const background = luminance(toRgb(backgroundHex));
        const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);

        expect(ratio, "normal-size active-state text must meet WCAG AA 4.5:1").to.be.at.least(4.5);
    });

    it("provides a descriptive accessible name for the bet amount input", async function () {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
        const betInput = appSource.match(/<input\b[\s\S]*?\/>/)?.[0];

        if (!betInput) {
            throw new Error("The bet amount input should be present.");
        }

        expect(betInput).to.include('aria-label="Bet amount in CROAK tokens"');
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
