// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PACTTreasury.sol";

contract PACTTreasuryFactory {
    address public immutable identity;
    address public immutable capabilityManager;
    address public immutable withdrawalSigner;
    address public immutable token;
    mapping(bytes32 => address) public treasuryOf;

    event TreasuryCreated(bytes32 indexed organizationId, address indexed treasury, address indexed owner, address token);
    error Unauthorized();
    error InvalidAddress();
    error TreasuryAlreadyExists();

    constructor(address identity_, address capabilityManager_, address withdrawalSigner_, address token_) {
        if (identity_ == address(0) || capabilityManager_ == address(0) || withdrawalSigner_ == address(0) || token_ == address(0)) revert InvalidAddress();
        identity = identity_;
        capabilityManager = capabilityManager_;
        withdrawalSigner = withdrawalSigner_;
        token = token_;
    }

    function createTreasury(bytes32 organizationId, address owner) external returns (address treasury) {
        if (!IPACTOrganizationOwner(identity).isOwner(organizationId, msg.sender)) revert Unauthorized();
        if (organizationId == bytes32(0) || owner == address(0) || owner != msg.sender) revert InvalidAddress();
        if (treasuryOf[organizationId] != address(0)) revert TreasuryAlreadyExists();
        treasury = address(new PACTTreasury(organizationId, owner, token, identity, capabilityManager, withdrawalSigner));
        treasuryOf[organizationId] = treasury;
        emit TreasuryCreated(organizationId, treasury, owner, token);
    }
}
