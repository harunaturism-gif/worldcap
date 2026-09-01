// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {CAPToken} from "../src/CAPToken.sol";
import {CAPVesting} from "../src/CAPVesting.sol";

contract CAPVestingTest is Test {
    CAPToken public token;
    CAPVesting public vesting;

    address public admin = address(0x1);
    address public minter = address(0x2);
    address public pauser = address(0x3);
    address public beneficiary = address(0x4);
    address public other = address(0x5);

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18;
    uint256 public constant ALLOCATION = 10_000 * 10 ** 18;

    uint64 public startTimestamp;
    uint64 public constant DURATION = 365 days;

    function setUp() public {
        startTimestamp = uint64(block.timestamp) + 100;
        token = new CAPToken(MAX_SUPPLY, admin, minter, pauser);
        vesting = new CAPVesting(beneficiary, startTimestamp, DURATION);

        vm.prank(minter);
        token.mint(address(vesting), ALLOCATION);
    }

    function testNoEarlyRelease() public {
        vm.warp(startTimestamp - 1);
        assertEq(vesting.vestedAmount(address(token), uint64(block.timestamp)), 0);

        vm.prank(beneficiary);
        vesting.release(address(token));
        assertEq(token.balanceOf(beneficiary), 0);
        assertEq(token.balanceOf(address(vesting)), ALLOCATION);
    }

    function testLinearRelease() public {
        vm.warp(startTimestamp + DURATION / 2);

        uint256 expectedVested = ALLOCATION / 2;
        assertEq(vesting.vestedAmount(address(token), uint64(block.timestamp)), expectedVested);

        vm.prank(beneficiary);
        vesting.release(address(token));

        assertEq(token.balanceOf(beneficiary), expectedVested);
        assertEq(token.balanceOf(address(vesting)), ALLOCATION - expectedVested);
    }

    function testFullRelease() public {
        vm.warp(startTimestamp + DURATION);

        assertEq(vesting.vestedAmount(address(token), uint64(block.timestamp)), ALLOCATION);

        vm.prank(beneficiary);
        vesting.release(address(token));

        assertEq(token.balanceOf(beneficiary), ALLOCATION);
        assertEq(token.balanceOf(address(vesting)), 0);
    }

    function testDoubleReleaseSafe() public {
        vm.warp(startTimestamp + DURATION);

        vm.prank(beneficiary);
        vesting.release(address(token));
        assertEq(token.balanceOf(beneficiary), ALLOCATION);

        // Call release again
        vm.prank(beneficiary);
        vesting.release(address(token));
        assertEq(token.balanceOf(beneficiary), ALLOCATION); // Balance should not change
    }

    function testBeneficiaryCannotBeChangedUnexpectedly() public {
        assertEq(vesting.owner(), beneficiary);

        vm.prank(other);
        vm.expectRevert();
        vesting.transferOwnership(other);
    }
}
