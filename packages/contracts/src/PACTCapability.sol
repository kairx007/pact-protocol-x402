// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICapabilityIdentity {
    function isOwner(bytes32 organizationId, address account) external view returns (bool);
    function isAgentAuthorized(bytes32 agentKey, address signer) external view returns (bool);
    function agentSigner(bytes32 agentKey) external view returns (address);
}

interface ICapabilityTreasury {
    function organizationId() external view returns (bytes32);
    function identity() external view returns (address);
    function capabilityManager() external view returns (address);
    function paymentToken() external view returns (address);
    function getAvailableBalance() external view returns (uint256);
    function reserve(bytes32 paymentId, bytes32 agentKey, address signer, uint256 amount) external;
    function settle(bytes32 paymentId, address recipient) external;
    function release(bytes32 paymentId) external;
}

/**
 * Bounded on-chain spending authority with hierarchical allocations.
 * Identity and treasury remain separate authorities; capabilities only constrain them.
 */
contract PACTCapability {
    uint8 public constant MAX_DEPTH = 8;
    uint8 public constant MAX_ALLOWLIST_SIZE = 32;

    struct Capability {
        bytes32 id;
        bytes32 parentId;
        bytes32 agentKey;
        address treasury;
        uint128 budget;
        uint128 spent;
        uint128 reserved;
        uint128 childAllocated;
        uint128 maxPerTransaction;
        bytes32 policyHash;
        uint64 validAfter;
        uint64 validUntil;
        uint8 depth;
        bool canDelegate;
        bool revoked;
        bool exists;
    }

    address public immutable identity;
    uint256 private nextId = 1;
    mapping(bytes32 => Capability) private capabilities;
    mapping(bytes32 => mapping(address => bool)) public allowedTokens;
    mapping(bytes32 => mapping(address => bool)) public allowedRecipients;
    mapping(bytes32 => mapping(bytes32 => bool)) public allowedServices;
    mapping(bytes32 => bytes32[]) private children;
    mapping(bytes32 => bytes32) public capabilityForPayment;
    mapping(bytes32 => bool) public finalizedPayment;
    mapping(bytes32 => address) public paymentRecipient;
    mapping(address => uint256) public committedCapabilityBudget;
    mapping(bytes32 => uint128) public subtreeReserved;

    event CapabilityCreated(bytes32 indexed capabilityId, bytes32 indexed organizationId, bytes32 indexed agentKey, bytes32 parentId, address treasury, uint128 budget, bytes32 policyHash);
    event CapabilityDelegated(bytes32 indexed parentId, bytes32 indexed childId, uint128 allocation);
    event CapabilityRevoked(bytes32 indexed capabilityId);
    event CapabilityUpdated(bytes32 indexed capabilityId, uint128 maxPerTransaction, uint64 validUntil, bytes32 policyHash);
    event CapabilityReserved(bytes32 indexed capabilityId, bytes32 indexed paymentId, uint128 amount);
    event CapabilitySettled(bytes32 indexed capabilityId, bytes32 indexed paymentId, uint128 amount);
    event CapabilityReservationReleased(bytes32 indexed capabilityId, bytes32 indexed paymentId, uint128 amount);

    error Unauthorized();
    error InvalidCapability();
    error InvalidPolicy();
    error CapabilityInactive();
    error InsufficientBudget();
    error AllowlistViolation();
    error DelegationNotAllowed();
    error MaxDepthExceeded();
    error PaymentAlreadyUsed();
    error InvalidAmount();

    constructor(address identity_) {
        if (identity_ == address(0)) revert InvalidPolicy();
        identity = identity_;
    }

    function createCapability(
        bytes32 organizationId,
        address treasury,
        bytes32 agentKey,
        uint128 budget,
        uint128 maxPerTransaction,
        uint64 validAfter,
        uint64 validUntil,
        bool canDelegate,
        address[] calldata tokens,
        address[] calldata recipients,
        bytes32[] calldata services,
        bytes32 policyHash
    ) external returns (bytes32 capabilityId) {
        if (!ICapabilityIdentity(identity).isOwner(organizationId, msg.sender)) revert Unauthorized();
        if (
            treasury == address(0) || agentKey == bytes32(0) || budget == 0 ||
            maxPerTransaction == 0 || maxPerTransaction > budget ||
            validUntil <= validAfter || validUntil <= block.timestamp ||
            tokens.length == 0 || tokens.length > MAX_ALLOWLIST_SIZE ||
            recipients.length > MAX_ALLOWLIST_SIZE || services.length > MAX_ALLOWLIST_SIZE
        ) revert InvalidPolicy();
        if (
            ICapabilityTreasury(treasury).organizationId() != organizationId ||
            ICapabilityTreasury(treasury).identity() != identity ||
            ICapabilityTreasury(treasury).capabilityManager() != address(this)
        ) revert InvalidPolicy();
        uint256 committed = committedCapabilityBudget[treasury];
        if (committed + budget > ICapabilityTreasury(treasury).getAvailableBalance()) revert InsufficientBudget();
        if (!ICapabilityIdentity(identity).isAgentAuthorized(agentKey, _agentSigner(agentKey))) revert Unauthorized();
        capabilityId = _newId(organizationId, agentKey);
        Capability storage cap = capabilities[capabilityId];
        cap.id = capabilityId;
        cap.agentKey = agentKey;
        _authorizedSigner[agentKey] = ICapabilityIdentity(identity).agentSigner(agentKey);
        cap.treasury = treasury;
        cap.budget = budget;
        cap.maxPerTransaction = maxPerTransaction;
        cap.policyHash = policyHash;
        cap.validAfter = validAfter;
        cap.validUntil = validUntil;
        cap.canDelegate = canDelegate;
        cap.exists = true;
        committedCapabilityBudget[treasury] = committed + budget;
        _setLists(capabilityId, tokens, recipients, services);
        emit CapabilityCreated(capabilityId, organizationId, agentKey, bytes32(0), treasury, budget, policyHash);
    }

    function delegateCapability(
        bytes32 parentId,
        bytes32 childAgentKey,
        address childSigner,
        uint128 childBudget,
        uint128 childMaxTransaction,
        uint64 childExpiry,
        address[] calldata childTokens,
        address[] calldata childRecipients,
        bytes32[] calldata childServices,
        bytes32 childPolicyHash
    ) external returns (bytes32 childId) {
        Capability storage parent = capabilities[parentId];
        if (!parent.exists || !isCapabilityActive(parentId)) revert CapabilityInactive();
        if (!parent.canDelegate) revert DelegationNotAllowed();
        if (parent.depth + 1 > MAX_DEPTH) revert MaxDepthExceeded();
        if (!ICapabilityIdentity(identity).isAgentAuthorized(parent.agentKey, msg.sender)) revert Unauthorized();
        if (!ICapabilityIdentity(identity).isAgentAuthorized(childAgentKey, childSigner)) revert Unauthorized();
        if (
            childBudget == 0 || childMaxTransaction == 0 || childMaxTransaction > parent.maxPerTransaction ||
            childExpiry > parent.validUntil || childExpiry <= block.timestamp ||
            childTokens.length == 0 || childTokens.length > MAX_ALLOWLIST_SIZE ||
            childRecipients.length > MAX_ALLOWLIST_SIZE || childServices.length > MAX_ALLOWLIST_SIZE
        ) revert InvalidPolicy();
        if (childBudget > availableBudget(parentId)) revert InsufficientBudget();
        _assertSubset(parentId, childTokens, childRecipients, childServices);
        childId = _newId(parentId, childAgentKey);
        Capability storage child = capabilities[childId];
        child.id = childId;
        child.parentId = parentId;
        child.agentKey = childAgentKey;
        _authorizedSigner[childAgentKey] = childSigner;
        child.treasury = parent.treasury;
        child.budget = childBudget;
        child.maxPerTransaction = childMaxTransaction;
        child.policyHash = childPolicyHash;
        child.validAfter = parent.validAfter;
        child.validUntil = childExpiry;
        child.depth = parent.depth + 1;
        child.canDelegate = parent.canDelegate;
        child.exists = true;
        parent.childAllocated += childBudget;
        children[parentId].push(childId);
        _setLists(childId, childTokens, childRecipients, childServices);
        emit CapabilityCreated(childId, ICapabilityTreasury(parent.treasury).organizationId(), childAgentKey, parentId, parent.treasury, childBudget, childPolicyHash);
        emit CapabilityDelegated(parentId, childId, childBudget);
    }

    function reservePayment(
        bytes32 capabilityId,
        bytes32 paymentId,
        address signer,
        uint128 amount,
        address token,
        address recipient,
        bytes32 service
    ) external {
        Capability storage cap = capabilities[capabilityId];
        if (!cap.exists || !isCapabilityActive(capabilityId)) revert CapabilityInactive();
        if (msg.sender != signer || !ICapabilityIdentity(identity).isAgentAuthorized(cap.agentKey, signer)) revert Unauthorized();
        if (amount == 0 || amount > cap.maxPerTransaction) revert InvalidAmount();
        if (!allowedTokens[capabilityId][token] || !allowedRecipients[capabilityId][recipient] || !allowedServices[capabilityId][service]) revert AllowlistViolation();
        if (token != ICapabilityTreasury(cap.treasury).paymentToken()) revert AllowlistViolation();
        if (amount > availableBudget(capabilityId)) revert InsufficientBudget();
        if (paymentId == bytes32(0) || capabilityForPayment[paymentId] != bytes32(0)) revert PaymentAlreadyUsed();
        capabilityForPayment[paymentId] = capabilityId;
        paymentRecipient[paymentId] = recipient;
        cap.reserved += amount;
        committedCapabilityBudget[cap.treasury] -= amount;
        bytes32 currentId = capabilityId;
        while (currentId != bytes32(0)) {
            subtreeReserved[currentId] += amount;
            currentId = capabilities[currentId].parentId;
        }
        ICapabilityTreasury(cap.treasury).reserve(paymentId, cap.agentKey, signer, amount);
        emit CapabilityReserved(capabilityId, paymentId, amount);
    }

    function settlePayment(bytes32 paymentId, address recipient) external {
        bytes32 capabilityId = capabilityForPayment[paymentId];
        Capability storage cap = capabilities[capabilityId];
        if (capabilityId == bytes32(0) || finalizedPayment[paymentId]) revert InvalidCapability();
        if (!isCapabilityActive(capabilityId)) revert CapabilityInactive();
        if (recipient == address(0) || paymentRecipient[paymentId] != recipient) revert AllowlistViolation();
        if (msg.sender != _authorizedSigner[cap.agentKey] && !ICapabilityIdentity(identity).isOwner(ICapabilityTreasury(cap.treasury).organizationId(), msg.sender)) revert Unauthorized();
        uint128 amount = _treasuryReservation(cap.treasury, paymentId);
        finalizedPayment[paymentId] = true;
        _propagateSpend(capabilityId, amount);
        ICapabilityTreasury(cap.treasury).settle(paymentId, recipient);
        emit CapabilitySettled(capabilityId, paymentId, amount);
    }

    function releasePayment(bytes32 paymentId) external {
        bytes32 capabilityId = capabilityForPayment[paymentId];
        Capability storage cap = capabilities[capabilityId];
        if (capabilityId == bytes32(0) || finalizedPayment[paymentId]) revert InvalidCapability();
        if (msg.sender != _authorizedSigner[cap.agentKey] && !ICapabilityIdentity(identity).isOwner(ICapabilityTreasury(cap.treasury).organizationId(), msg.sender)) revert Unauthorized();
        uint128 amount = _treasuryReservation(cap.treasury, paymentId);
        bool capabilityActive = isCapabilityActive(capabilityId);
        bool parentActive = cap.parentId != bytes32(0) && isCapabilityActive(cap.parentId);
        finalizedPayment[paymentId] = true;
        cap.reserved -= amount;
        _decreaseSubtreeReservations(capabilityId, amount);
        if (capabilityActive || parentActive) {
            committedCapabilityBudget[cap.treasury] += amount;
        }
        if (!capabilityActive && parentActive) {
            capabilities[cap.parentId].childAllocated -= amount;
        }
        ICapabilityTreasury(cap.treasury).release(paymentId);
        emit CapabilityReservationReleased(capabilityId, paymentId, amount);
    }

    function revokeCapability(bytes32 capabilityId) external {
        Capability storage cap = capabilities[capabilityId];
        if (!cap.exists || !ICapabilityIdentity(identity).isOwner(ICapabilityTreasury(cap.treasury).organizationId(), msg.sender)) revert Unauthorized();
        if (cap.revoked) revert InvalidCapability();
        uint256 unspent = uint256(cap.budget) - cap.spent - subtreeReserved[capabilityId];
        if (cap.parentId == bytes32(0)) {
            committedCapabilityBudget[cap.treasury] -= unspent;
        } else if (isCapabilityActive(cap.parentId)) {
            capabilities[cap.parentId].childAllocated -= uint128(unspent);
        }
        cap.revoked = true;
        emit CapabilityRevoked(capabilityId);
    }

    function updateCapability(bytes32 capabilityId, uint128 newMaxPerTransaction, uint64 newValidUntil, bytes32 policyHash) external {
        Capability storage cap = capabilities[capabilityId];
        if (!cap.exists || !ICapabilityIdentity(identity).isOwner(ICapabilityTreasury(cap.treasury).organizationId(), msg.sender)) revert Unauthorized();
        if (cap.revoked || newMaxPerTransaction == 0 || newMaxPerTransaction > cap.maxPerTransaction || newValidUntil > cap.validUntil || newValidUntil <= block.timestamp) revert InvalidPolicy();
        cap.maxPerTransaction = newMaxPerTransaction;
        cap.validUntil = newValidUntil;
        cap.policyHash = policyHash;
        emit CapabilityUpdated(capabilityId, newMaxPerTransaction, newValidUntil, policyHash);
    }

    function isCapabilityActive(bytes32 capabilityId) public view returns (bool) {
        Capability storage cap = capabilities[capabilityId];
        if (!cap.exists || cap.revoked || block.timestamp < cap.validAfter || block.timestamp >= cap.validUntil) return false;
        if (!_agentCurrentlyAuthorized(cap.agentKey)) return false;
        bytes32 parentId = cap.parentId;
        uint8 traversed;
        while (parentId != bytes32(0)) {
            if (++traversed > MAX_DEPTH) return false;
            Capability storage parent = capabilities[parentId];
            if (!parent.exists || parent.revoked || block.timestamp < parent.validAfter || block.timestamp >= parent.validUntil) return false;
            if (!_agentCurrentlyAuthorized(parent.agentKey)) return false;
            parentId = parent.parentId;
        }
        return true;
    }

    function availableBudget(bytes32 capabilityId) public view returns (uint128) {
        Capability storage cap = capabilities[capabilityId];
        uint256 committed = uint256(cap.spent) + cap.reserved + cap.childAllocated;
        if (committed > cap.budget) revert InsufficientBudget();
        return uint128(uint256(cap.budget) - committed);
    }

    function getCapability(bytes32 capabilityId) external view returns (Capability memory) { return capabilities[capabilityId]; }
    function getChildren(bytes32 capabilityId) external view returns (bytes32[] memory) { return children[capabilityId]; }

    function _propagateSpend(bytes32 capabilityId, uint128 amount) private {
        Capability storage current = capabilities[capabilityId];
        if (current.reserved < amount) revert InsufficientBudget();
        current.reserved -= amount;
        current.spent += amount;
        subtreeReserved[capabilityId] -= amount;
        bytes32 parentId = current.parentId;
        uint8 traversed;
        while (parentId != bytes32(0)) {
            if (++traversed > MAX_DEPTH) revert MaxDepthExceeded();
            Capability storage parent = capabilities[parentId];
            if (parent.childAllocated < amount) revert InsufficientBudget();
            parent.childAllocated -= amount;
            parent.spent += amount;
            subtreeReserved[parentId] -= amount;
            parentId = parent.parentId;
        }
    }

    function _decreaseSubtreeReservations(bytes32 capabilityId, uint128 amount) private {
        bytes32 currentId = capabilityId;
        while (currentId != bytes32(0)) {
            subtreeReserved[currentId] -= amount;
            currentId = capabilities[currentId].parentId;
        }
    }

    function _treasuryReservation(address treasury, bytes32 paymentId) private view returns (uint128) {
        (bool success, bytes memory result) = treasury.staticcall(abi.encodeWithSignature("reservations(bytes32)", paymentId));
        if (!success) revert InvalidCapability();
        uint256 amount = abi.decode(result, (uint256));
        if (amount == 0 || amount > type(uint128).max) revert InvalidCapability();
        return uint128(amount);
    }

    function _agentCurrentlyAuthorized(bytes32 agentKey) private view returns (bool) {
        // PACTIdentity exposes a signer-specific check; capability records bind the signer at creation.
        return _authorizedSigner[agentKey] != address(0) && ICapabilityIdentity(identity).isAgentAuthorized(agentKey, _authorizedSigner[agentKey]);
    }

    mapping(bytes32 => address) private _authorizedSigner;

    function _agentSigner(bytes32 agentKey) private view returns (address) {
        return ICapabilityIdentity(identity).agentSigner(agentKey);
    }

    function _newId(bytes32 parent, bytes32 agentKey) private returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, parent, agentKey, nextId++));
    }

    function _setLists(bytes32 id, address[] calldata tokens, address[] calldata recipients, bytes32[] calldata services) private {
        for (uint256 i; i < tokens.length; ++i) {
            if (tokens[i] == address(0)) revert InvalidPolicy();
            allowedTokens[id][tokens[i]] = true;
        }
        for (uint256 i; i < recipients.length; ++i) {
            if (recipients[i] == address(0)) revert InvalidPolicy();
            allowedRecipients[id][recipients[i]] = true;
        }
        for (uint256 i; i < services.length; ++i) {
            if (services[i] == bytes32(0)) revert InvalidPolicy();
            allowedServices[id][services[i]] = true;
        }
    }

    function _assertSubset(bytes32 parentId, address[] calldata tokens, address[] calldata recipients, bytes32[] calldata services) private view {
        for (uint256 i; i < tokens.length; ++i) if (!allowedTokens[parentId][tokens[i]]) revert AllowlistViolation();
        for (uint256 i; i < recipients.length; ++i) if (!allowedRecipients[parentId][recipients[i]]) revert AllowlistViolation();
        for (uint256 i; i < services.length; ++i) if (!allowedServices[parentId][services[i]]) revert AllowlistViolation();
    }
}
