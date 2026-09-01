// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {VestingWallet} from "openzeppelin-contracts/contracts/finance/VestingWallet.sol";

// Provides a standard vesting primitive that can be instantiated for
// team, treasury, and ecosystem allocations when those are finalized.
contract CAPVesting is VestingWallet {
    constructor(address beneficiaryAddress, uint64 startTimestamp, uint64 durationSeconds)
        VestingWallet(beneficiaryAddress, startTimestamp, durationSeconds)
    {}
}
