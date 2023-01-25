const { network, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../helper-hardhat-config");
const { verify } = require("../utils/verify");

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("2");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  let vrfCoordinatorV2Mock, vrfCoordinatorV2Address, subscriptionId;
  const chainId = network.config.chainId;

  if (developmentChains.includes(network.name)) {
    vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
    vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;
    const transactionRes = await vrfCoordinatorV2Mock.createSubscription();
    const transactionReceived = await transactionRes.wait(1);
    subscriptionId = transactionReceived.events[0].args.subId;
    // Fund the subscription
    // Usually we need the link token on real network
    await vrfCoordinatorV2Mock.fundSubscription(
      subscriptionId,
      VRF_SUB_FUND_AMOUNT
    );
  } else {
    vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"];
    subscriptionId = networkConfig[chainId]["subscriptionId"];
  }

  const entranceFee = networkConfig[chainId]["entranceFee"];
  const gasLane = networkConfig[chainId]["gasLane"];
  const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"];
  const interval = networkConfig[chainId]["interval"];

  const args = [
    vrfCoordinatorV2Address,
    entranceFee,
    gasLane,
    subscriptionId,
    callbackGasLimit,
    interval,
  ];
  const lottery = await deploy("Lottery", {
    from: deployer,
    args,
    log: true,
    // @ts-ignore
    waitConfirmation: network.config.blockConfirmations || 1,
  });

  if (vrfCoordinatorV2Mock) {
    await vrfCoordinatorV2Mock.addConsumer(
      subscriptionId.toNumber(),
      lottery.address
    );
  }
  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    // verify
    await verify(lottery.address, args);
  }
  log("----------------------------------------");
};

module.exports.tags = ["all", "lottery"];
