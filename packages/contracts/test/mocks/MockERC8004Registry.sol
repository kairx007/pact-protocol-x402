// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockERC8004Registry {
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => address) public wallets;

    function register(uint256 agentId, address owner, address wallet) external {
        require(ownerOf[agentId] == address(0), "already registered");
        ownerOf[agentId] = owner;
        wallets[agentId] = wallet;
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        require(ownerOf[agentId] != address(0), "not registered");
        return wallets[agentId];
    }
}
