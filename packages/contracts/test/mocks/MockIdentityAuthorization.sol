// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockIdentityAuthorization {
    mapping(bytes32 => mapping(address => bool)) public authorizedAgents;
    mapping(bytes32 => address) public owners;

    function setAgent(bytes32 agentKey, address signer, bool authorized) external {
        authorizedAgents[agentKey][signer] = authorized;
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
}
