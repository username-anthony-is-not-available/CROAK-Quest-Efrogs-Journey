const { HardhatUserConfig } = require("hardhat/config");
require("@nomicfoundation/hardhat-toolbox");

const config = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun"
    }
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6"
  },
  networks: {
    hardhat: {
      chainId: 59144,
      chains: {
        59144: {
          hardforkHistory: {
            cancun: 0
          }
        }
      },
      forking: {
        url: process.env.LINEA_MAINNET_RPC_URL || "https://rpc.linea.build",
        enabled: process.env.FORK !== "false",
        blockNumber: 32300000
      }
    },
  }
};

module.exports = config;
