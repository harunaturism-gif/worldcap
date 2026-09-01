// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {CAPToken} from "../src/CAPToken.sol";
import {IAccessControl} from "openzeppelin-contracts/contracts/access/IAccessControl.sol";
import {ERC20Capped} from "openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

contract CAPTokenTest is Test {
    CAPToken public token;

    address public admin = address(0x1);
    address public minter = address(0x2);
    address public pauser = address(0x3);
    address public user = address(0x4);
    address public user2 = address(0x5);

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18;

    bytes32 minterRole;
    bytes32 pauserRole;
    bytes32 adminRole;

    function setUp() public {
        token = new CAPToken(MAX_SUPPLY, admin, minter, pauser);
        minterRole = token.MINTER_ROLE();
        pauserRole = token.PAUSER_ROLE();
        adminRole = token.DEFAULT_ADMIN_ROLE();
    }

    function testDeployment() public view {
        assertEq(token.name(), "WorldCAP");
        assertEq(token.symbol(), "CAP");
        assertEq(token.cap(), MAX_SUPPLY);
        assertTrue(token.hasRole(adminRole, admin));
        assertTrue(token.hasRole(minterRole, minter));
        assertTrue(token.hasRole(pauserRole, pauser));
    }

    function testConfiguredMaxSupply() public view {
        assertEq(token.cap(), MAX_SUPPLY);
    }

    function testMintBelowCap() public {
        vm.prank(minter);
        token.mint(user, 100 * 10 ** 18);
        assertEq(token.balanceOf(user), 100 * 10 ** 18);
        assertEq(token.totalSupply(), 100 * 10 ** 18);
    }

    function testMintExactlyToCap() public {
        vm.prank(minter);
        token.mint(user, MAX_SUPPLY);
        assertEq(token.balanceOf(user), MAX_SUPPLY);
        assertEq(token.totalSupply(), MAX_SUPPLY);
    }

    function testMintAboveCapRejected() public {
        vm.prank(minter);
        token.mint(user, MAX_SUPPLY);

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(ERC20Capped.ERC20ExceededCap.selector, MAX_SUPPLY + 1, MAX_SUPPLY));
        token.mint(user, 1);
    }

    function testUnauthorizedMintRejected() public {
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, user, minterRole)
        );
        token.mint(user, 100 * 10 ** 18);
    }

    function testRevokedMinterRejected() public {
        vm.prank(admin);
        token.revokeRole(minterRole, minter);

        vm.prank(minter);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, minter, minterRole)
        );
        token.mint(user, 100 * 10 ** 18);
    }

    function testTransfer() public {
        vm.prank(minter);
        token.mint(user, 100 * 10 ** 18);

        vm.prank(user);
        token.transfer(user2, 50 * 10 ** 18);

        assertEq(token.balanceOf(user), 50 * 10 ** 18);
        assertEq(token.balanceOf(user2), 50 * 10 ** 18);
    }

    function testTransferFrom() public {
        vm.prank(minter);
        token.mint(user, 100 * 10 ** 18);

        vm.prank(user);
        token.approve(user2, 50 * 10 ** 18);

        vm.prank(user2);
        token.transferFrom(user, user2, 50 * 10 ** 18);

        assertEq(token.balanceOf(user), 50 * 10 ** 18);
        assertEq(token.balanceOf(user2), 50 * 10 ** 18);
    }

    function testBurn() public {
        vm.prank(minter);
        token.mint(user, 100 * 10 ** 18);

        vm.prank(user);
        token.burn(50 * 10 ** 18);

        assertEq(token.balanceOf(user), 50 * 10 ** 18);
        assertEq(token.totalSupply(), 50 * 10 ** 18);
    }

    function testBurnFrom() public {
        vm.prank(minter);
        token.mint(user, 100 * 10 ** 18);

        vm.prank(user);
        token.approve(user2, 50 * 10 ** 18);

        vm.prank(user2);
        token.burnFrom(user, 50 * 10 ** 18);

        assertEq(token.balanceOf(user), 50 * 10 ** 18);
        assertEq(token.totalSupply(), 50 * 10 ** 18);
    }

    function testPauseBehavior() public {
        vm.prank(minter);
        token.mint(user, 100 * 10 ** 18);

        vm.prank(pauser);
        token.pause();

        vm.prank(user);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.transfer(user2, 50 * 10 ** 18);

        vm.prank(pauser);
        token.unpause();

        vm.prank(user);
        token.transfer(user2, 50 * 10 ** 18);
        assertEq(token.balanceOf(user2), 50 * 10 ** 18);
    }

    function testUnauthorizedPauseRejected() public {
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, user, pauserRole)
        );
        token.pause();
    }

    function testFuzzTotalSupplyAlwaysLessThanMaxSupply(uint256 amount1, uint256 amount2) public {
        amount1 = bound(amount1, 0, MAX_SUPPLY);
        amount2 = bound(amount2, 0, MAX_SUPPLY);

        vm.startPrank(minter);
        token.mint(user, amount1);

        if (amount1 + amount2 > MAX_SUPPLY) {
            vm.expectRevert(
                abi.encodeWithSelector(ERC20Capped.ERC20ExceededCap.selector, amount1 + amount2, MAX_SUPPLY)
            );
            token.mint(user2, amount2);
        } else {
            token.mint(user2, amount2);
        }
        vm.stopPrank();

        assertTrue(token.totalSupply() <= MAX_SUPPLY);
    }
}
