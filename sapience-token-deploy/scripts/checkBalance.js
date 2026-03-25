const hre = require("hardhat");

const TOKENS = [
  { symbol: "pathUSD", address: "0x20c0000000000000000000000000000000000000" },
  { symbol: "AlphaUSD", address: "0x20c0000000000000000000000000000000000001" },
  { symbol: "BetaUSD", address: "0x20c0000000000000000000000000000000000002" },
  { symbol: "ThetaUSD", address: "0x20c0000000000000000000000000000000000003" },
];

const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;
  const network = await provider.getNetwork();

  console.log("Network:", `${network.name} (chainId: ${network.chainId})`);
  console.log("Deployer:", deployer.address);

  const nativeBalance = await provider.getBalance(deployer.address);
  console.log("Native balance:", hre.ethers.formatEther(nativeBalance));

  for (const token of TOKENS) {
    try {
      const contract = new hre.ethers.Contract(token.address, erc20Abi, provider);
      const [rawBalance, decimals] = await Promise.all([
        contract.balanceOf(deployer.address),
        contract.decimals(),
      ]);

      const formatted = hre.ethers.formatUnits(rawBalance, decimals);
      console.log(`${token.symbol} balance:`, formatted);
    } catch (error) {
      console.log(`${token.symbol} balance:`, "unavailable");
      console.log(`  Reason: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
