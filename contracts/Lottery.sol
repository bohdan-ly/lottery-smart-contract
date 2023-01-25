// Lottery

// Enter lottery (paying some amount)
// Pick a random winner (verifiable random)
// Winner to be selected every X minute -> completely automate
// Oracle -> Rendomness, Automated execution

// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Lottery__NotEnoughETHEntered();
error Lottery__TransferFailed();
error Lottery__NotOpen();
error Lottery__UpkeepNotNeeded(
  uint256 currentBalance,
  uint256 numPlayers,
  uint256 lotteryState
);

/** @title A sample Lottery contract
 * @author Bohdan L
 * @notice This contract is for creating an untamperable decentrilized lottery
 * @dev This implements Chainlink VRF v2 and Chainlink Keepers
 */
contract Lottery is VRFConsumerBaseV2, KeeperCompatibleInterface {
  /* Type declaration */
  enum LotteryState {
    OPEN,
    CALCULATING
  } // uint256 0 = OPEN, 1 = CALCULATING

  /* State Variables */
  uint256 private immutable i_entranceFee;
  address payable[] private s_players;
  VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
  bytes32 private immutable i_gasLane;
  uint64 private immutable i_subscriptionId;
  uint16 private constant REQUEST_CONFIRMATION = 3;
  uint32 private immutable i_callbackGasLimit;
  uint32 private constant NUM_WORDS = 1;
  uint256 private immutable i_interval;

  /* Lottery variables */

  address private s_recentWinner;
  LotteryState private s_lotteryState;
  uint256 private s_lastTimeStamp;

  /* Events */
  event LotteryEnter(address indexed player);
  event RequestedLotteryWinner(uint256 indexed reqId);
  event WinnerPicked(address indexed winner);

  /* Functinos */
  constructor(
    address vrfCoordinatorV2, // contract => require mock deploy
    uint256 entranceFee,
    bytes32 gasLane,
    uint64 subscriptionId,
    uint32 callbackGasLimit,
    uint32 interval
  ) VRFConsumerBaseV2(vrfCoordinatorV2) {
    i_entranceFee = entranceFee;
    i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
    i_gasLane = gasLane;
    i_subscriptionId = subscriptionId;
    i_callbackGasLimit = callbackGasLimit;
    s_lotteryState = LotteryState.OPEN;
    s_lastTimeStamp = block.timestamp;
    i_interval = interval;
  }

  function enterLottery() public payable {
    // require(msg.value > i_entranceFee, "Not enough ETH") => this solution less gas efficient cause of the error string
    if (msg.value < i_entranceFee) revert Lottery__NotEnoughETHEntered();
    if (s_lotteryState != LotteryState.OPEN) revert Lottery__NotOpen();

    s_players.push(payable(msg.sender));
    // Emit an event when we update a dynamic array of mapping
    // Named events with the function reversed
    emit LotteryEnter(msg.sender);
  }

  /**
   * @dev This is the function that Chainlink Keeper nodes call
   * they look for the `upkeepNeeded` to return true.
   * The following should be true in order to return true:
   * 1. Our time interval should have passed
   * 2. The lottery should have at least 2 players, and have some ETH
   * 3. Our subscription is funded with LINK
   * 4. The lottery should in an "open" state.
   */

  function checkUpkeep(
    bytes memory /*checkData*/
  )
    public
    override
    returns (
      bool upkeepNeeded,
      bytes memory /* performData */
    )
  {
    bool isOpen = (LotteryState.OPEN == s_lotteryState);
    // block.timestamp - last block timestamp
    bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
    bool hasPlayers = (s_players.length > 0);
    bool hasBalance = address(this).balance > 0;
    upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
  }

  function performUpkeep(
    bytes calldata /* performData */
  ) external override {
    (bool upkeepNeeded, ) = checkUpkeep("");
    if (!upkeepNeeded)
      revert Lottery__UpkeepNotNeeded(
        address(this).balance,
        s_players.length,
        uint256(s_lotteryState)
      );
    // Request the random number
    // Once we get it, do something with it
    // 2 transaction process
    s_lotteryState = LotteryState.CALCULATING;

    uint256 requestId = i_vrfCoordinator.requestRandomWords(
      i_gasLane, // gasLane
      i_subscriptionId,
      REQUEST_CONFIRMATION,
      i_callbackGasLimit,
      NUM_WORDS
    );

    emit RequestedLotteryWinner(requestId);
  }

  function fulfillRandomWords(
    uint256, /*requestId*/
    uint256[] memory randomWords
  ) internal override {
    // s_players size 10
    // randomNumber 200
    // 202 % 10 = 2;
    uint256 idxOfWinner = randomWords[0] % s_players.length;
    address payable recentWinner = s_players[idxOfWinner];
    s_recentWinner = recentWinner;
    s_lotteryState = LotteryState.OPEN;
    s_players = new address payable[](0);
    s_lastTimeStamp = block.timestamp;
    (bool success, ) = recentWinner.call{ value: address(this).balance }("");
    if (!success) {
      revert Lottery__TransferFailed();
    }
    emit WinnerPicked(recentWinner);
  }

  /* View / Pure functions */

  function getEntranceFee() public view returns (uint256) {
    return i_entranceFee;
  }

  function getPlayer(uint256 idx) public view returns (address) {
    return s_players[idx];
  }

  function getRecentWinner() public view returns (address) {
    return s_recentWinner;
  }

  function getLotteryState() public view returns (LotteryState) {
    return s_lotteryState;
  }

  function getNumWords() public pure returns (uint256) {
    return NUM_WORDS;
  }

  function getNumOfPlayers() public view returns (uint256) {
    return s_players.length;
  }

  function getLastTimeStamp() public view returns (uint256) {
    return s_lastTimeStamp;
  }

  function getReqConfirmations() public pure returns (uint256) {
    return REQUEST_CONFIRMATION;
  }

  function getInterval() public view returns (uint256) {
    return i_interval;
  }
}
