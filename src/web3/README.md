# Web3 Architecture & NFT Integration

This directory contains Web3 contract interaction logic and ABI interface definitions for CROAK Quest: Efrogs' Journey.

## Interfaces & ABIs

- `IERC20_ABI.json`: Standard and mock ERC-20 contract interface definitions.
- `IERC20_Standard_ABI.json`: Canonical ERC-20 interface signatures.
- `IERC721_ABI.json`: ERC-721 & ERC-721Enumerable signatures (`balanceOf`, `tokenOfOwnerByIndex`, `tokenURI`).
- `IERC721Enumerable_ABI.json`: Enumerable collectible interface definition.
- `CroakQuestEfrogsJourneyABI.json`: Main betting game contract ABI.

## NFT Trait Detection Flow

`WalletManager` provides seamless detection of eFrogs NFT holdings and trait extraction for player frog skins and game bonus multipliers:

1. **`getFirstNFTId(contractAddress)`**:
   - Connects to the specified NFT contract using `IERC721_ABI`.
   - Queries `balanceOf(walletAddress)`.
   - If balance is greater than zero, queries `tokenOfOwnerByIndex(walletAddress, 0)` to retrieve the player's primary token ID.
   - If no NFTs are owned, throws a `'No NFTs found in the wallet'` error.

2. **`getNFTMetadata(tokenId, contractAddress)`**:
   - Connects to the NFT contract using `IERC721_ABI`.
   - Calls `tokenURI(tokenId)` to resolve the metadata endpoint.
   - Automatic IPFS Gateway Translation: Converts `ipfs://` protocol URIs to `https://ipfs.io/ipfs/` gateway URLs.
   - Fetches metadata JSON via HTTP fetch and returns the parsed object.

3. **`getBodyBaseProperty(contractAddress)`**:
   - Executes `getFirstNFTId` and `getNFTMetadata`.
   - Searches `metadata.attributes` for an item where `trait_type === 'Body Base'`.
   - Logs status to console: `[NFT] Detected token ID: {id}, Body Base: {trait}`.
   - Returns the trait value (e.g., `'Tree Frog Green'`), or `'Not found'` without throwing unhandled JS exceptions if the wallet owns no NFTs or if fetching metadata fails.

## Web3 Error Handling

Web3 errors and user rejections are normalized via `src/web3/errorNormalizer.ts` (ADR-003) to distinguish user cancellations (e.g. MetaMask code `4001` or `ACTION_REJECTED`) from contract reverts and network errors.
