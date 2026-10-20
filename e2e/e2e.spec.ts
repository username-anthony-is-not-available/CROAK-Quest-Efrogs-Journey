import { test, expect } from '@playwright/test';

// Helper to set up network routes and mock window.ethereum
const setupMockEnvironment = async (page: any, options: { mockAccount?: string; chainId?: string } = {}) => {
  const account = options.mockAccount || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  const chainId = options.chainId || '0xe708';

  // Intercept external Linea RPC and IPFS network calls so tests run reliably offline/isolated without 503s
  await page.route(/(rpc\.linea\.build|linea\.drpc\.org|linea\.blockpi\.network|1rpc\.io|ipfs\.io)/, async (route: any) => {
    const request = route.request();
    if (request.method() === 'POST') {
      let postData: any = {};
      try {
        postData = request.postDataJSON() || {};
      } catch {
        postData = {};
      }

      const processRequest = (req: any) => {
        const method = req ? req.method : undefined;
        let result: any = '0x0000000000000000000000000000000000000000000000000000000000000000';

        if (method === 'eth_chainId') result = chainId;
        else if (method === 'net_version') result = '59144';
        else if (method === 'eth_blockNumber') result = '0x1000';
        else if (method === 'eth_getBalance') result = '0x1000000000000000000';
        else if (method === 'eth_getBlockByNumber') {
          result = {
            number: '0x1000',
            hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
            timestamp: '0x60000000',
            parentHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
            nonce: '0x0000000000000000',
            sha3Uncles: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
            logsBloom: '0x00',
            transactionsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
            stateRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
            receiptsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
            miner: '0x0000000000000000000000000000000000000000',
            difficulty: '0x1',
            totalDifficulty: '0x1',
            extraData: '0x',
            size: '0x100',
            gasLimit: '0x1c9c380',
            gasUsed: '0x0',
            transactions: []
          };
        } else if (method === 'eth_call') {
          const callData = req.params && req.params[0] ? req.params[0].data || '' : '';
          if (callData.startsWith('0x70a08231')) {
            // balanceOf -> 1
            result = '0x0000000000000000000000000000000000000000000000000000000000000001';
          } else if (callData.startsWith('0x2f745c59')) {
            // tokenOfOwnerByIndex -> 1
            result = '0x0000000000000000000000000000000000000000000000000000000000000001';
          } else if (callData.startsWith('0xc87b56dd')) {
            // tokenURI -> https://ipfs.io/ipfs/QmTest
            result = '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001b68747470733a2f2f697066732e696f2f697066732f516d546573740000000000';
          } else {
            result = '0x0000000000000000000000000000000000000000000000000000000000000000';
          }
        }

        return {
          jsonrpc: '2.0',
          id: req && req.id !== undefined ? req.id : 1,
          result
        };
      };

      let responseBody: any;
      if (Array.isArray(postData)) {
        responseBody = postData.map(processRequest);
      } else {
        responseBody = processRequest(postData);
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responseBody)
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        attributes: [
          { trait_type: 'Body Base', value: 'Tree Frog Green' }
        ]
      })
    });
  });

  // Inject window.ethereum mock
  await page.addInitScript(({ account, chainId }: { account: string; chainId: string }) => {
    const defaultTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    (window as any).ethereum = {
      isMetaMask: true,
      request: async ({ method, params }: { method: string; params?: any[] }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
          return [account];
        }
        if (method === 'eth_chainId') {
          return chainId;
        }
        if (method === 'net_version') {
          return '59144';
        }
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
          return null;
        }
        if (method === 'eth_blockNumber') {
          return '0x1000';
        }
        if (method === 'eth_gasPrice' || method === 'eth_maxPriorityFeePerGas') {
          return '0x3b9aca00';
        }
        if (method === 'eth_estimateGas') {
          return '0x5208';
        }
        if (method === 'eth_getBalance') {
          return '0x1000000000000000000';
        }
        if (method === 'eth_sendTransaction') {
          return defaultTxHash;
        }
        if (method === 'eth_getTransactionReceipt') {
          return {
            status: '0x1',
            transactionHash: defaultTxHash,
            blockNumber: '0x1001',
            blockHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
            contractAddress: null,
            cumulativeGasUsed: '0x5208',
            gasUsed: '0x5208',
            logs: [
              {
                topics: [
                  '0x933189912be2171ec26d70a316260840b2a75878d655027bc916dd5a89eb0ea2' // Bet(address,uint256,bool,bool)
                ],
                data: '0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000'
              }
            ]
          };
        }
        if (method === 'eth_call') {
          const callData = params && params[0] ? params[0].data || '' : '';
          if (callData.startsWith('0x70a08231')) {
            return '0x0000000000000000000000000000000000000000000000000000000000000001';
          }
          if (callData.startsWith('0x2f745c59')) {
            return '0x0000000000000000000000000000000000000000000000000000000000000001';
          }
          if (callData.startsWith('0xc87b56dd')) {
            return '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001b68747470733a2f2f697066732e696f2f697066732f516d546573740000000000';
          }
          return '0x0000000000000000000000000000000000000000000000000000000000000000';
        }
        return null;
      },
      on: () => {},
      removeListener: () => {}
    };
  }, { account, chainId });
};

test.describe('CROAK Quest E2E Tests', () => {
  let consoleErrors: string[] = [];
  let pageErrors: Error[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    pageErrors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      pageErrors.push(err);
    });
  });

  test('Phaser canvas initializes and renders game container without console errors', async ({ page }) => {
    await setupMockEnvironment(page);
    await page.goto('/');

    // Verify game container is rendered in DOM
    const gameContainer = page.locator('#game-container');
    await expect(gameContainer).toBeVisible();

    // Verify canvas element is created by Phaser
    const canvas = page.locator('#game-container canvas');
    await expect(canvas).toBeVisible();

    // Verify sidebar menu and initial wallet UI elements
    const connectBtn = page.getByRole('button', { name: 'Connect Wallet' });
    await expect(connectBtn).toBeVisible();
    await expect(connectBtn).toBeEnabled();

    const playBtn = page.getByRole('button', { name: 'Play Now' });
    await expect(playBtn).toBeVisible();
    await expect(playBtn).toBeDisabled();

    // Verify no unhandled console or page errors
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('Connect Wallet button successfully connects mock wallet and enables controls', async ({ page }) => {
    await setupMockEnvironment(page);
    await page.goto('/');

    const connectBtn = page.getByRole('button', { name: 'Connect Wallet' });
    await connectBtn.click();

    // Check button updates state to Wallet Connected
    const connectedBtn = page.getByRole('button', { name: 'Wallet Connected' });
    await expect(connectedBtn).toBeVisible();
    await expect(connectedBtn).toBeDisabled();

    // Bet amount input and Play Now button should now be enabled
    const betInput = page.getByPlaceholder('Enter $CROAK Amount');
    await expect(betInput).toBeEnabled();

    const playBtn = page.getByRole('button', { name: 'Play Now' });
    await expect(playBtn).toBeEnabled();

    // Verify no console errors occurred during wallet connection
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('Submitting a bet executes optimistic game flow without console errors', async ({ page }) => {
    await setupMockEnvironment(page);
    await page.goto('/');

    // Connect wallet
    const connectBtn = page.getByRole('button', { name: 'Connect Wallet' });
    await connectBtn.click();

    // Enter bet amount
    const betInput = page.getByPlaceholder('Enter $CROAK Amount');
    await betInput.fill('10');

    // Click Play Now
    const playBtn = page.getByRole('button', { name: 'Play Now' });
    await playBtn.click();

    // Wait briefly for optimistic game transition
    await page.waitForTimeout(1000);

    // Verify canvas is still visible and rendering
    const canvas = page.locator('#game-container canvas');
    await expect(canvas).toBeVisible();

    // Verify no console errors occurred during the entire interaction
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
