require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.24",
  networks: {
    tempo: {
      url: process.env.TEMPO_RPC_URL || "https://rpc.tempo.xyz",
      chainId: 4217,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    tempoTestnet: {
      url: process.env.TEMPO_TESTNET_RPC_URL || "https://rpc.moderato.tempo.xyz",
      chainId: 42431,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
