# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-10-18

### Security & Smart Contracts
- **Chainlink VRF Integration**: Replaced block-based pseudo-randomness (`block.timestamp` and `block.prevrandao`) with Chainlink VRF V2 Plus (`VRFConsumerBaseV2Plus`).
- **Two-Step Betting Model**: Refactored `bet()` into a asynchronous request-and-fulfill workflow. Emits `BetRequested` on bet submission and `BetSettled` upon Chainlink VRF callback resolution.
- **Pending Bets Mapping**: Introduced `s_pendingBets` mapping and `PendingBet` struct to maintain state of open bets securely across blocks.
- **Same-Block Exploit Mitigation**: Solved same-block simulation and revert attacks by decoupling bet requests from randomness fulfillment.
- **Testing & Tooling**: Added `VRFCoordinatorV2MockProxy` inheriting `VRFCoordinatorV2_5Mock` for local unit testing and automated test coverage.
