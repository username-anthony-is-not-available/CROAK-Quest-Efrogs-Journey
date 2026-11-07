# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Chainlink VRF integration in `CroakQuestEfrogsJourney` smart contract replacing pseudo-randomness with provably fair, verifiable on-chain randomness.
- Asynchronous two-step betting workflow: request dispatched upon `bet()` emitting `BetRequested` and fulfilled via `fulfillRandomWords()` callback emitting `Bet`.
- Attacker contract unit tests to guarantee that contracts cannot query or conditionally exploit bet outcomes in the same block.
