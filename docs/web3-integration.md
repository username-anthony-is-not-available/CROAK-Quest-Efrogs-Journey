# Web3 Integration & Error Normalization

This document outlines the Web3 error handling, wallet state management, and network error normalization in **CROAK Quest: Efrogs' Journey**.

---

## 1. ADR-003: Centralized Web3 Error Normalizer

To prevent soft-locks and deliver a clean user experience across various wallet providers (MetaMask, Coinbase Wallet, WalletConnect, Hardware Wallets), all Web3 interactions are passed through a centralized error normalizer (`src/web3/errorNormalizer.ts`).

### Architecture Decision
Distinguish user intent (e.g. active cancellation/rejection in wallet popups) from contract reverts and network connectivity errors.

---

## 2. Supported Wallet Error Codes

| Standard / Provider Code | Code Identifier | Description & Trigger | Normalization Result | Console Log Level |
| :--- | :--- | :--- | :--- | :--- |
| `4001` | `ACTION_REJECTED` | User clicks **Reject** or **Cancel** in the wallet transaction/signature popup | `USER_REJECTED`<br>Message: *"Transaction cancelled by user"* | `console.warn` |
| `4902` | `CHAIN_NOT_ADDED` | Requested chain (Linea Mainnet, `0xe708`) is not yet added to MetaMask | Automatically prompts `wallet_addEthereumChain` | `console.error` (if addition fails) |
| `CALL_EXCEPTION` | `UNPREDICTABLE_GAS_LIMIT` | Contract execution reverted on-chain (e.g., bet exceeds max bet cap, contract paused) | `CONTRACT_REVERT`<br>Message: Revert reason or default revert error | `console.error` |
| `NETWORK_ERROR` | `SERVER_ERROR` / Timeout | RPC provider failure, network timeout, or lost internet connection | `NETWORK_ERROR`<br>Message: *"Network error. Please check your connection or RPC endpoint."* | `console.error` |
| `INSUFFICIENT_FUNDS` | `INSUFFICIENT_FUNDS` | Account lacks required token balance or ETH for gas | `INSUFFICIENT_FUNDS`<br>Message: *"Insufficient funds to complete transaction."* | `console.error` |

---

## 3. UI State Recovery & Toast Notifications

1. **Validation Safety**:
   Input amounts are validated in `App.tsx` *before* `isGameInProgress` is set to `true`. Invalid inputs (<= 0, non-numeric) display inline validation messages without disabling the form inputs or play button.

2. **User Cancellation Recovery**:
   When a user cancels a transaction (Error `4001` / `ACTION_REJECTED`), `WalletManager` normalizes the error, logs a warning (`console.warn`), and `App.tsx` displays an inline `info` toast notification: *"Transaction cancelled by user"*. Form inputs and action buttons remain active.

3. **Optimistic Bet Rollback**:
   If a transaction fails after the Phaser game loop starts optimistic animation (`onTxSent`), `cancelOptimisticBet()` is invoked on the Phaser game scene to revert animations cleanly while resetting `isGameInProgress` to `false`.
