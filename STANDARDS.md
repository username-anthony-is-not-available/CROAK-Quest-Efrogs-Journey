# Development Standards

This document defines the development guidelines and standards for the CROAK Quest: Efrogs' Journey repository. All contributors and autonomous agents must adhere to these standards.

## 1. Smart Contract Development (Solidity)

- **Version:** Use Solidity `0.8.24`.
- **Libraries:** Utilize OpenZeppelin contracts for standard implementations (ERC20, ERC721, Ownable, etc.).
- **Style:** Follow the [Solidity Style Guide](https://docs.soliditylang.org/en/v0.8.24/style-guide.html).
- **Security:**
  - Use `ReentrancyGuard` for functions that transfer funds.
  - Implement access control using `Ownable` or `AccessControl`.
  - Ensure all mathematical operations are safe (Solidity 0.8+ has built-in overflow checks).

## 2. Frontend Development (React & Phaser 3)

- **Framework:** React 18+ with Vite as the build tool.
- **Game Engine:** Phaser 3.80.1.
- **Linting:** Follow ESLint configurations provided in `.eslintrc.cjs`.
- **State Management:** Use React hooks (useState, useEffect, useContext) for UI state and Phaser's internal systems for game state.

## 3. Testing Requirements

- **Smart Contracts:** Use Hardhat for unit and integration tests. All new contract logic must have 100% test coverage.
- **Frontend:** (Optional but recommended) Use Playwright or Vitest for critical UI/UX paths.
- **Execution:** All tests must pass before any code is merged. Run tests using `npm run test`.

## 4. Documentation

- **Code:** Add comments for complex logic. Use NatSpec for Solidity functions.
- **Readability:** Maintain a clean and organized directory structure.
- **Updates:** Update `README.md` and `BACKLOG.md` when significant changes are made.

## 5. Commit & PR Conventions

- **Commit Messages:** Follow [Conventional Commits](https://www.conventionalcommits.org/).
- **PR Descriptions:** Explain *what* was changed and *why*. Reference relevant issues or backlog items.
