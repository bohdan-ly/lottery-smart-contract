const { expect, assert } = require("chai");
const { deployments, ethers, getNamedAccounts, network } = require("hardhat");
const {
  networkConfig,
  developmentChains,
} = require("../../helper-hardhat-config");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery", function () {
      let lottery,
        vrfCoordinatorV2Mock,
        lotteryEntranceFee,
        deployer,
        interval,
        accounts;
      const chainId = network.config.chainId;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        accounts = await ethers.getSigners();
        await deployments.fixture("all");
        lottery = await ethers.getContract("Lottery", deployer);
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );
        lotteryEntranceFee = await lottery.getEntranceFee();
        interval = await lottery.getInterval();
      });

      describe("constructor", function () {
        it("initializes lottery correctly", async function () {
          // Ideally we make our tests have just 1 assert per "it"
          const lotteryState = await lottery.getLotteryState();

          assert.equal(lotteryState.toString(), "0");
          assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
        });
      });

      describe("enterLottery", function () {
        it("reverts when you paid not enough", async function () {
          // Ideally we make our tests have just 1 assert per "it"
          await expect(lottery.enterLottery()).to.be.revertedWith(
            "Lottery__NotEnoughETHEntered"
          );
        });

        it("records player when they entered", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          const playerFromContract = await lottery.getPlayer(0);
          assert.equal(playerFromContract, deployer);
        });

        it("emits event on enter", async function () {
          await expect(
            lottery.enterLottery({ value: lotteryEntranceFee })
          ).to.emit(lottery, "LotteryEnter");
        });

        it("doesn't allow to enter when lottery processing/calculating", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          // We pretend to be a Chainlink Keeper
          await lottery.performUpkeep([]);
          await expect(
            lottery.enterLottery({ value: lotteryEntranceFee })
          ).to.be.revertedWith("Lottery__NotOpen");
        });
      });

      describe("checkUpkeep", function () {
        it("returns false if nobody send enough ETH", async function () {
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
          assert(!upkeepNeeded);
        });
        it("returns false if lottery closed", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await lottery.performUpkeep("0x");
          const lotteryState = await lottery.getLotteryState();
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x");
          assert.equal(lotteryState.toString(), "1");
          assert.equal(upkeepNeeded, false);
        });
        it("returns false if enough time hasn't passed", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() - 5,
          ]); // use a higher number here if this test fails
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x"); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(!upkeepNeeded);
        });
        it("returns true if enough time has passed, has players, eth, and is open", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x"); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(upkeepNeeded);
        });
      });

      describe("performUpkeep", function () {
        it("can only run if checkUpkeep is true", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const tx = await lottery.performUpkeep([]);
          assert(tx);
        });

        it("reverts when checkUpkeep is false", async function () {
          await expect(lottery.performUpkeep([])).to.be.revertedWith(
            "Lottery__UpkeepNotNeeded(0, 0, 0)"
          );
        });

        it("update lottery state, emit events and calls a vrf coordinator", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const txRes = await lottery.performUpkeep([]);
          const txReceipt = await txRes.wait(1);
          const reqId = txReceipt.events[1].args.reqId;
          const lotteryState = await lottery.getLotteryState();
          assert(reqId.toNumber() > 0);
          assert(lotteryState.toString() == "1");
        });

        it("emits event if checkUpkeep is true", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          await expect(lottery.performUpkeep([])).to.emit(
            lottery,
            "RequestedLotteryWinner"
          );
        });
      });

      describe("fulfillRandomWords", function () {
        beforeEach(async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
        });

        it("can only be called after performUpkeep", async function () {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)
          ).to.be.revertedWith("nonexistent request");
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)
          ).to.be.revertedWith("nonexistent request");
        });

        it("picks a winner, reset lottery, and sends eth", async () => {
          const additionalEntrance = 3;
          const startingAccountIndex = 1;

          for (
            let i = startingAccountIndex;
            i < startingAccountIndex + additionalEntrance;
            i++
          ) {
            lottery = lottery.connect(accounts[i]); // Returns a new instance of the Lottery contract connected to player
            await lottery.enterLottery({ value: lotteryEntranceFee }); // Enter to lottery as new user
          }
          const startingTimestamp = await lottery.getLastTimeStamp(); // stores starting timestamp (before we fire our event)

          // performUpkeep (mock being chainlink keepers)
          // fullfilRandomWords (mocks being the Chainlink VRF)
          // We will have to wait for the fullfilRandomWords to be called
          await new Promise(async (resolve, reject) => {
            // Setting up the listener
            lottery.once("WinnerPicked", async () => {
              console.log("WinnerPicked event fired");

              try {
                const recentWinner = await lottery.getRecentWinner();
                const lotteryState = await lottery.getLotteryState();
                const winnerEndingBalance = await accounts[
                  startingAccountIndex
                ].getBalance();
                const endingTimestamp = await lottery.getLastTimeStamp();
                const numPlayers = await lottery.getNumOfPlayers();

                await expect(lottery.getPlayer(0)).to.be.reverted;

                assert.equal(numPlayers.toString(), "0");
                assert.equal(lotteryState.toString(), "0");
                assert(endingTimestamp > startingTimestamp);

                assert.equal(
                  recentWinner.toString(),
                  accounts[startingAccountIndex].address
                );

                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance
                    .add(
                      lotteryEntranceFee
                        .mul(additionalEntrance)
                        .add(lotteryEntranceFee)
                    )
                    .toString()
                );
                assert(endingTimestamp > startingTimestamp);
                console.log("Tests passed");

                resolve(true);
              } catch (e) {
                console.log(e);
                reject(e);
              }
            });

            // below, we will fire event, and the listener will pick it up, and resolve
            console.log("Trying to fire WinnerPicked event...");

            const tx = await lottery.performUpkeep([]);
            const txReceipt = await tx.wait(1);
            const winnerStartingBalance = await accounts[
              startingAccountIndex
            ].getBalance();
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args.reqId,
              lottery.address
            );
          });
        });
      });
    });
