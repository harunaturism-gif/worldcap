// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @notice Append-only, non-custodial registry for closed WorldCAP draw inputs.
/// @dev This contract never receives WLD and has no winner or payout function.
contract DrawCommitmentRegistry {
    struct Commitment {
        bytes32 manifestRoot;
        uint256 eligibleCount;
        bytes32 algorithmVersionHash;
        uint64 anchoredAtBlock;
        address anchorer;
    }

    address public immutable anchorAuthority;
    mapping(bytes32 drawIdHash => Commitment) private commitments;

    event DrawAnchored(
        bytes32 indexed drawIdHash,
        bytes32 indexed manifestRoot,
        uint256 eligibleCount,
        bytes32 algorithmVersionHash,
        uint64 anchoredAtBlock,
        address indexed anchorer
    );

    error Unauthorized();
    error InvalidCommitment();
    error DrawAlreadyAnchored();
    error DrawNotAnchored();

    constructor(address authority) {
        if (authority == address(0)) revert InvalidCommitment();
        anchorAuthority = authority;
    }

    function anchorDraw(
        bytes32 drawIdHash,
        bytes32 manifestRoot,
        uint256 eligibleCount,
        bytes32 algorithmVersionHash
    ) external {
        if (msg.sender != anchorAuthority) revert Unauthorized();
        if (drawIdHash == bytes32(0) || manifestRoot == bytes32(0) || eligibleCount == 0 || algorithmVersionHash == bytes32(0)) {
            revert InvalidCommitment();
        }
        if (commitments[drawIdHash].anchoredAtBlock != 0) revert DrawAlreadyAnchored();
        uint64 anchoredAt = uint64(block.number);
        commitments[drawIdHash] = Commitment(manifestRoot, eligibleCount, algorithmVersionHash, anchoredAt, msg.sender);
        emit DrawAnchored(drawIdHash, manifestRoot, eligibleCount, algorithmVersionHash, anchoredAt, msg.sender);
    }

    function getCommitment(bytes32 drawIdHash) external view returns (Commitment memory commitment) {
        commitment = commitments[drawIdHash];
        if (commitment.anchoredAtBlock == 0) revert DrawNotAnchored();
    }

    function isAnchored(bytes32 drawIdHash) external view returns (bool) {
        return commitments[drawIdHash].anchoredAtBlock != 0;
    }
}
