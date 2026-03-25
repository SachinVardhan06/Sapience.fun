const hre = require("hardhat");

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const marketAddress = process.env.MARKET_ADDRESS;
  const sapienceTokenAddress =
    process.env.SAPIENCE_TOKEN_ADDRESS ||
    "0x9Df816ec87a24fc539129f45588479a258E982dB";
  const paymentTokenAddress =
    process.env.PAYMENT_TOKEN_ADDRESS ||
    "0x20c0000000000000000000000000000000000000";

  if (!marketAddress) {
    throw new Error("MARKET_ADDRESS is required in .env");
  }

  const sapienceAmount = process.env.MARKET_SAPIENCE_LIQUIDITY || "100000000";
  const paymentAmount = process.env.MARKET_PAYMENT_LIQUIDITY || "5000";

  const sapienceToken = new hre.ethers.Contract(
    sapienceTokenAddress,
    ERC20_ABI,
    deployer,
  );
  const paymentToken = new hre.ethers.Contract(
    paymentTokenAddress,
    ERC20_ABI,
    deployer,
  );

  const [sapienceDecimals, paymentDecimals] = await Promise.all([
    sapienceToken.decimals(),
    paymentToken.decimals(),
  ]);

  const sapienceRaw = hre.ethers.parseUnits(sapienceAmount, sapienceDecimals);
  const paymentRaw = hre.ethers.parseUnits(paymentAmount, paymentDecimals);

  const sapienceTx = await sapienceToken.transfer(marketAddress, sapienceRaw);
  await sapienceTx.wait();

  const paymentTx = await paymentToken.transfer(marketAddress, paymentRaw);
  await paymentTx.wait();

  console.log("Deployer:", deployer.address);
  console.log("Market:", marketAddress);
  console.log("SAPIENCE funded:", sapienceAmount);
  console.log("Payment funded:", paymentAmount);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
