const { developmentChains } = require("../helper-hardhat-config");
const { network, ethers } = require("hardhat");

const BASE_FEE = ethers.utils.parseEther("0.25");
const GAS_PRICE_LINK = 1e9; // link per gas => calculated value base on gas price of the chain.

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;
  const args = [BASE_FEE, GAS_PRICE_LINK];

  if (developmentChains.includes(network.name)) {
    log("Local network detected. Deploying mocks...");
    // deploy mock vrf coordinator
    await deploy("VRFCoordinatorV2Mock", {
      from: deployer,
      log: true,
      args,
    });

    log("Mocks Deployed");
    log("------------------------------");
  }
};

module.exports.tags = ["all", "mocks"];
