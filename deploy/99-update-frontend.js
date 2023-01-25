const { ethers, network } = require("hardhat");
const fs = require("fs");

const FRONTEND_ADDRESSES_FILE =
  "../nextjs-lottery/src/constants/contractAddresses.json";

const FRONTEND_ABI_FILE = "../nextjs-lottery/src/constants/abi.json";

module.exports = async () => {
  if (process.env.UPDATE_FRONTEND) {
    console.log("Updating frontend...");
    updateContractAddresses();
    updateABI();
  }
};

async function updateContractAddresses() {
  const lottery = await ethers.getContract("Lottery");
  const chainId = network.config.chainId?.toString() || "";
  const currentAddresses = JSON.parse(
    fs.readFileSync(FRONTEND_ADDRESSES_FILE, "utf8")
  );

  if (chainId in currentAddresses) {
    if (!currentAddresses[chainId].includes(lottery.address)) {
      currentAddresses[chainId].push(lottery.address);
    }
  } else {
    currentAddresses[chainId] = [lottery.address];
  }
  fs.writeFileSync(FRONTEND_ADDRESSES_FILE, JSON.stringify(currentAddresses));
}

async function updateABI() {
  const lottery = await ethers.getContract("Lottery");
  const abi = lottery.interface.format(ethers.utils.FormatTypes.json);
  if (!Array.isArray(abi)) {
    fs.writeFileSync(FRONTEND_ABI_FILE, abi);
  } else {
    console.log("ABI had invalid format, please check and try again.");
  }
}

module.exports.tags = ["all", "frontend"];
