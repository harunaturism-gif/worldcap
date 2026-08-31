// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {DrawCommitmentRegistry} from "../src/DrawCommitmentRegistry.sol";

contract UnauthorizedCaller {
    function anchor(DrawCommitmentRegistry registry, bytes32 drawId, bytes32 root, bytes32 algorithm) external returns (bool) {
        (bool ok,) = address(registry).call(abi.encodeCall(registry.anchorDraw, (drawId, root, 1, algorithm)));
        return ok;
    }
}

contract DrawCommitmentRegistryTest {
    DrawCommitmentRegistry private registry;
    bytes32 private constant DRAW = keccak256("beta-draw");
    bytes32 private constant ROOT = keccak256("manifest-root");
    bytes32 private constant ALGORITHM = keccak256("worldcap-draw-v1");

    function setUp() public { registry = new DrawCommitmentRegistry(address(this)); }

    function testAnchorsExactlyOnce() public {
        registry.anchorDraw(DRAW, ROOT, 42, ALGORITHM);
        DrawCommitmentRegistry.Commitment memory stored = registry.getCommitment(DRAW);
        require(stored.manifestRoot == ROOT && stored.eligibleCount == 42 && stored.algorithmVersionHash == ALGORITHM, "bad anchor");
        (bool overwritten,) = address(registry).call(abi.encodeCall(registry.anchorDraw, (DRAW, keccak256("replacement"), 99, ALGORITHM)));
        require(!overwritten, "anchor overwritten");
    }

    function testRejectsUnauthorizedAnchor() public {
        UnauthorizedCaller caller = new UnauthorizedCaller();
        require(!caller.anchor(registry, DRAW, ROOT, ALGORITHM), "unauthorized anchor accepted");
    }

    function testRejectsInvalidCommitmentsAndMissingDraws() public {
        (bool zeroDraw,) = address(registry).call(abi.encodeCall(registry.anchorDraw, (bytes32(0), ROOT, 1, ALGORITHM)));
        (bool zeroRoot,) = address(registry).call(abi.encodeCall(registry.anchorDraw, (DRAW, bytes32(0), 1, ALGORITHM)));
        (bool zeroCount,) = address(registry).call(abi.encodeCall(registry.anchorDraw, (DRAW, ROOT, 0, ALGORITHM)));
        (bool zeroAlgorithm,) = address(registry).call(abi.encodeCall(registry.anchorDraw, (DRAW, ROOT, 1, bytes32(0))));
        (bool missing,) = address(registry).call(abi.encodeCall(registry.getCommitment, (DRAW)));
        require(!zeroDraw && !zeroRoot && !zeroCount && !zeroAlgorithm && !missing, "invalid commitment accepted");
    }

    function testRejectsZeroAuthority() public {
        try new DrawCommitmentRegistry(address(0)) { revert("zero authority accepted"); }
        catch { }
    }

    function testHasNoWinnerOrCustodyInput() public pure {
        require(DrawCommitmentRegistry.anchorDraw.selector == bytes4(keccak256("anchorDraw(bytes32,bytes32,uint256,bytes32)")), "unexpected ABI");
    }
}

