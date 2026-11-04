// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockIdentityAuthorization {
    mapping(bytes32 => mapping(address => bool)) public authorizedAgents;
    mapping(bytes32 => address) public owners;
    mapping(bytes32 => address) public signers;

    function committedCapabilityBudget(address) external pure returns (uint256) {
        return 0;
    }

    function setAgent(bytes32 agentKey, address signer, bool authorized) external {
        authorizedAgents[agentKey][signer] = authorized;
        signers[agentKey] = signer;
    }

    function setOwner(bytes32 organizationId, address owner) external {
        owners[organizationId] = owner;
    }

    function isAgentAuthorized(bytes32 agentKey, address signer) external view returns (bool) {
        return authorizedAgents[agentKey][signer];
    }

    function isOwner(bytes32 organizationId, address account) external view returns (bool) {
        return owners[organizationId] == account;
    }

    function agentSigner(bytes32 agentKey) external view returns (address) {
        return signers[agentKey];
    }
}
