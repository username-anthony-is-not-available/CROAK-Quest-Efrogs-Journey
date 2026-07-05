const { HardhatUserConfig } = require("hardhat/config");
require("@nomicfoundation/hardhat-toolbox");

const config = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun"
    }
  },
  networks: {
    hardhat: {
      chainId: 1337
    },
  }
};

module.exports = config;
