import chai from "chai";
import { normalizeWeb3Error, isUserRejectionError } from "../src/web3/errorNormalizer.ts";

const { expect } = chai;

describe("Web3 Error Normalizer", function () {
    describe("isUserRejectionError", function () {
        it("should detect code 4001 as user rejection", function () {
            const err = { code: 4001, message: "User rejected" };
            expect(isUserRejectionError(err)).to.be.true;
        });

        it("should detect ACTION_REJECTED as user rejection", function () {
            const err = { code: "ACTION_REJECTED", message: "user rejected transaction" };
            expect(isUserRejectionError(err)).to.be.true;
        });

        it("should detect nested info error code 4001 as user rejection", function () {
            const err = { info: { error: { code: 4001 } }, message: "MetaMask Tx Signature: User denied transaction signature." };
            expect(isUserRejectionError(err)).to.be.true;
        });

        it("should detect cause error code 4001 as user rejection", function () {
            const err = { cause: { code: 4001 }, message: "Rejected by user" };
            expect(isUserRejectionError(err)).to.be.true;
        });

        it("should detect rejection message string without code", function () {
            const err = { message: "User denied transaction signature." };
            expect(isUserRejectionError(err)).to.be.true;
        });

        it("should return false for generic non-rejection errors", function () {
            const err = { code: "CALL_EXCEPTION", message: "execution reverted: BetExceedsMaxLiquidity" };
            expect(isUserRejectionError(err)).to.be.false;
        });
    });

    describe("normalizeWeb3Error", function () {
        it("should normalize code 4001 to USER_REJECTED with user-friendly message", function () {
            const rawError = { code: 4001, message: "User rejected the request." };
            const normalized = normalizeWeb3Error(rawError);

            expect(normalized.code).to.equal("USER_REJECTED");
            expect(normalized.isUserRejection).to.be.true;
            expect(normalized.message).to.equal("Transaction cancelled by user");
        });

        it("should normalize ACTION_REJECTED to USER_REJECTED", function () {
            const rawError = { code: "ACTION_REJECTED", message: "user rejected transaction" };
            const normalized = normalizeWeb3Error(rawError);

            expect(normalized.code).to.equal("USER_REJECTED");
            expect(normalized.isUserRejection).to.be.true;
            expect(normalized.message).to.equal("Transaction cancelled by user");
        });

        it("should normalize contract revert error", function () {
            const rawError = { code: "CALL_EXCEPTION", message: "execution reverted: BetExceedsMaxLiquidity" };
            const normalized = normalizeWeb3Error(rawError);

            expect(normalized.code).to.equal("CONTRACT_REVERT");
            expect(normalized.isUserRejection).to.be.false;
            expect(normalized.message).to.contain("BetExceedsMaxLiquidity");
        });

        it("should normalize network error", function () {
            const rawError = { code: "NETWORK_ERROR", message: "failed to fetch" };
            const normalized = normalizeWeb3Error(rawError);

            expect(normalized.code).to.equal("NETWORK_ERROR");
            expect(normalized.isUserRejection).to.be.false;
            expect(normalized.message).to.contain("Network error");
        });

        it("should normalize insufficient funds error", function () {
            const rawError = { code: "INSUFFICIENT_FUNDS", message: "insufficient funds for intrinsic transaction cost" };
            const normalized = normalizeWeb3Error(rawError);

            expect(normalized.code).to.equal("INSUFFICIENT_FUNDS");
            expect(normalized.isUserRejection).to.be.false;
            expect(normalized.message).to.contain("Insufficient funds");
        });

        it("should handle already normalized error object idempotently", function () {
            const firstPass = normalizeWeb3Error({ code: 4001, message: "rejected" });
            const secondPass = normalizeWeb3Error(firstPass);

            expect(secondPass).to.equal(firstPass);
        });
    });
});
