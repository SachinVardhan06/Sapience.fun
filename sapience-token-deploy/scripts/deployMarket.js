const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const sapienceTokenAddress =
    process.env.SAPIENCE_TOKEN_ADDRESS ||
    "0x9Df816ec87a24fc539129f45588479a258E982dB";
  const paymentTokenAddress =
    process.env.PAYMENT_TOKEN_ADDRESS ||
    "0x20c0000000000000000000000000000000000000";
  const sapiencePerPaymentUnit = BigInt(
    process.env.SAPIENCE_PER_PAYMENT_UNIT || "20000",
  );

  const Market = await hre.ethers.getContractFactory("SapienceMarket");
  const market = await Market.deploy(
    deployer.address,
    sapienceTokenAddress,
    paymentTokenAddress,
    sapiencePerPaymentUnit,
  );

  await market.waitForDeployment();
  const marketAddress = await market.getAddress();

  console.log("Deployer:", deployer.address);
  console.log("SAPIENCE token:", sapienceTokenAddress);
  console.log("Payment token:", paymentTokenAddress);
  console.log("Rate (SAPIENCE per 1 payment token):", sapiencePerPaymentUnit.toString());
  console.log("SapienceMarket deployed at:", marketAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
