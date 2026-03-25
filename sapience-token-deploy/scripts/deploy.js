const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  // Change supply to your preferred value before mainnet deploy.
  const initialSupply = hre.ethers.parseUnits("1000000000", 18);

  const Token = await hre.ethers.getContractFactory("SapienceToken");
  const token = await Token.deploy(deployer.address, initialSupply);

  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  console.log("Deployer:", deployer.address);
  console.log("SAPIENCE deployed at:", tokenAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
