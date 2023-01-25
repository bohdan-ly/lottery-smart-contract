const { expect, assert } = require("chai");
const { deployments, ethers, getNamedAccounts, network } = require("hardhat");

const {
  networkConfig,
  developmentChains,
} = require("../../helper-hardhat-config");

developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery Unit Tests", async function () {
      let lottery, lotteryEntranceFee, deployer, accounts;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        accounts = await ethers.getSigners();
        lottery = await ethers.getContract("Lottery", deployer);
        lotteryEntranceFee = await lottery.getEntranceFee();
      });

      describe("fulfillRandomWords", function () {
        it("works with live Chainlink Keeper and Chainlink VRF, we get a random winner", async function () {
          // enter the lottery
          const startingTimestamp = await lottery.getLastTimeStamp();

          await new Promise(async (resolve, reject) => {
            // setup listener before enter the lottery
            lottery.once("WinnerPicked", async () => {
              console.log("Winner Picked event fired");
              try {
                const recentWinner = await lottery.getRecentWinner();
                const lotteryState = await lottery.getLotteryState();
                const winnerEndingBalance = await accounts[0].getBalance();
                const endingTimestamp = await lottery.getLastTimeStamp();

                await expect(lottery.getPlayer(0)).to.be.reverted; // will be reverted because player array will not have even object on 0 index
                assert.equal(recentWinner.toString(), accounts[0].address);
                assert.equal(lotteryState.toString(), "0");
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(lotteryEntranceFee).toString()
                );
                assert(endingTimestamp > startingTimestamp);
                resolve(true);
              } catch (e) {
                console.log(e);
                reject(e);
              }
            });

            // The entering the lottery
            console.log("Trying to fire WinnerPicked event...");
            console.log(`Contract address: ${lottery.address}`);
            await lottery.enterLottery({ value: lotteryEntranceFee });
            const winnerStartingBalance = await accounts[0].getBalance();

            // and this code will not complete until listener has finishing listening
          });
        });
      });
    });
