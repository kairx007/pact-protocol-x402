// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC8004IdentityRegistry {
    function ownerOf(uint256 agentId) external view returns (address);
    function getAgentWallet(uint256 agentId) external view returns (address);
}

/**
 * Organization owner controlled ERC-8004 binding.
 * This contract records identity and signer authorization only; it grants no payment capability.
 */
contract PACTIdentity {
    struct AgentBinding {
        bytes32 organizationId;
        address signer;
        address registry;
        uint256 agentId;
        uint256 identityChainId;
        address verifiedOwner;
        bool active;
    }

    mapping(bytes32 => address) public organizationOwner;
    mapping(bytes32 => AgentBinding) private bindings;
    mapping(bytes32 => bool) public agentKeyUsed;

    event OrganizationOwnerSet(bytes32 indexed organizationId, address indexed owner);
    event AgentRegistered(bytes32 indexed agentKey, bytes32 indexed organizationId, address indexed signer, address registry, uint256 agentId, uint256 identityChainId);
    event AgentSignerUpdated(bytes32 indexed agentKey, address indexed oldSigner, address indexed newSigner);
    event AgentRevoked(bytes32 indexed agentKey);

    error Unauthorized();
    error InvalidAddress();
    error InvalidIdentity();
    error AgentKeyCollision();
    error InactiveBinding();

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert InvalidAddress();
        // The bootstrap owner can transfer org ownership only through an organization binding.
        organizationOwner[bytes32(0)] = initialOwner;
    }

    function setOrganizationOwner(bytes32 organizationId, address newOwner) external {
        if (newOwner == address(0)) revert InvalidAddress();
        address current = organizationOwner[organizationId];
        if (msg.sender != current && !(current == address(0) && msg.sender == organizationOwner[bytes32(0)])) {
            revert Unauthorized();
        }
        organizationOwner[organizationId] = newOwner;
        emit OrganizationOwnerSet(organizationId, newOwner);
    }

    function registerAgent(bytes32 organizationId, address registry, uint256 agentId, address signer)
        external
        returns (bytes32 agentKey)
    {
        if (msg.sender != organizationOwner[organizationId]) revert Unauthorized();
        if (registry == address(0) || signer == address(0) || organizationId == bytes32(0)) revert InvalidAddress();
        IERC8004IdentityRegistry identityRegistry = IERC8004IdentityRegistry(registry);
        address identityOwner;
        address registeredWallet;
        try identityRegistry.ownerOf(agentId) returns (address result) { identityOwner = result; }
        catch { revert InvalidIdentity(); }
        try identityRegistry.getAgentWallet(agentId) returns (address result) { registeredWallet = result; }
        catch { revert InvalidIdentity(); }
        if (identityOwner == address(0)) revert InvalidIdentity();
        if (registeredWallet != address(0) && registeredWallet != signer) revert InvalidIdentity();
        if (registeredWallet == address(0) && identityOwner != signer) revert InvalidIdentity();

        uint256 identityChainId = block.chainid;
        agentKey = keccak256(abi.encode(organizationId, registry, agentId, identityChainId));
        if (agentKeyUsed[agentKey]) revert AgentKeyCollision();
        agentKeyUsed[agentKey] = true;
        bindings[agentKey] = AgentBinding({
            organizationId: organizationId,
            signer: signer,
            registry: registry,
            agentId: agentId,
            identityChainId: identityChainId,
            verifiedOwner: identityOwner,
            active: true
        });
        emit AgentRegistered(agentKey, organizationId, signer, registry, agentId, identityChainId);
    }

    function updateAgentSigner(bytes32 agentKey, address newSigner) external {
        AgentBinding storage binding = bindings[agentKey];
        if (!binding.active) revert InactiveBinding();
        if (msg.sender != organizationOwner[binding.organizationId]) revert Unauthorized();
        if (newSigner == address(0)) revert InvalidAddress();
        IERC8004IdentityRegistry registry = IERC8004IdentityRegistry(binding.registry);
        address currentOwner;
        address currentWallet;
        try registry.ownerOf(binding.agentId) returns (address result) { currentOwner = result; }
        catch { revert InvalidIdentity(); }
        try registry.getAgentWallet(binding.agentId) returns (address result) { currentWallet = result; }
        catch { revert InvalidIdentity(); }
        if (currentOwner != binding.verifiedOwner) revert InvalidIdentity();
        if (currentWallet != address(0) && currentWallet != newSigner) revert InvalidIdentity();
        if (currentWallet == address(0) && currentOwner != newSigner) revert InvalidIdentity();
        address oldSigner = binding.signer;
        binding.signer = newSigner;
        emit AgentSignerUpdated(agentKey, oldSigner, newSigner);
    }

    function revokeAgent(bytes32 agentKey) external {
        AgentBinding storage binding = bindings[agentKey];
        if (msg.sender != organizationOwner[binding.organizationId]) revert Unauthorized();
        if (!binding.active) revert InactiveBinding();
        binding.active = false;
        emit AgentRevoked(agentKey);
    }

    function isAgentAuthorized(bytes32 agentKey, address signer) external view returns (bool) {
        AgentBinding storage binding = bindings[agentKey];
        if (!binding.active || binding.signer != signer) return false;
        try IERC8004IdentityRegistry(binding.registry).ownerOf(binding.agentId) returns (address currentOwner) {
            if (currentOwner != binding.verifiedOwner) return false;
        } catch { return false; }
        try IERC8004IdentityRegistry(binding.registry).getAgentWallet(binding.agentId) returns (address wallet) {
            if (wallet != address(0) && wallet != signer) return false;
        } catch { return false; }
        return true;
    }

    function isOwner(bytes32 organizationId, address account) external view returns (bool) {
        return organizationOwner[organizationId] == account && account != address(0);
    }

    function getAgentBinding(bytes32 agentKey) external view returns (AgentBinding memory) {
        return bindings[agentKey];
    }
}
