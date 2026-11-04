// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Treasury {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface IERC1271TreasuryOwner {
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4);
}

interface IPACTIdentityAuthorization {
    function isAgentAuthorized(bytes32 agentKey, address signer) external view returns (bool);
}

interface IPACTOrganizationOwner {
    function isOwner(bytes32 organizationId, address account) external view returns (bool);
}

interface IPACTCapabilityBudget {
    function committedCapabilityBudget(address treasury) external view returns (uint256);
}

library SafeERC20Treasury {
    error SafeTransferFailed();

    function safeTransfer(IERC20Treasury token, address to, uint256 value) internal {
        (bool success, bytes memory result) = address(token).call(
            abi.encodeCall(IERC20Treasury.transfer, (to, value))
        );
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) revert SafeTransferFailed();
    }

    function safeTransferFrom(IERC20Treasury token, address from, address to, uint256 value) internal {
        (bool success, bytes memory result) = address(token).call(
            abi.encodeCall(IERC20Treasury.transferFrom, (from, to, value))
        );
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) revert SafeTransferFailed();
    }
}

contract PACTTreasury {
    using SafeERC20Treasury for IERC20Treasury;

    struct TreasuryState {
        address owner;
        address paymentToken;
        uint256 totalDeposited;
        uint256 totalReserved;
        uint256 totalSpent;
        bool paused;
    }

    bytes32 public immutable organizationId;
    address public immutable identity;
    address public immutable capabilityManager;
    address public immutable withdrawalSigner;
    TreasuryState private state;
    mapping(bytes32 => uint256) public reservations;
    mapping(bytes32 => bool) public settled;
    mapping(bytes32 => bool) public usedWithdrawalNonce;
    uint256 private entered = 1;

    bytes32 private constant WITHDRAW_TYPEHASH = keccak256(
        "TreasuryWithdrawal(bytes32 organizationId,address treasury,address token,address recipient,uint256 amount,uint256 nonce,uint256 deadline)"
    );
    bytes4 private constant ERC1271_MAGIC_VALUE = 0x1626ba7e;

    event Deposited(address indexed sender, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed recipient, uint256 amount, uint256 newBalance);
    event TreasuryPaused(address indexed by);
    event TreasuryUnpaused(address indexed by);
    event FundsReserved(bytes32 indexed paymentId, bytes32 indexed agentKey, uint256 amount, uint256 totalReserved);
    event PaymentSettled(bytes32 indexed paymentId, address indexed recipient, uint256 amount, uint256 totalReserved);
    event ReservationReleased(bytes32 indexed paymentId, uint256 amount, uint256 totalReserved);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidState();
    error InsufficientAvailableBalance();
    error InvalidSignature();
    error SignatureExpired();
    error NonceAlreadyUsed();
    error ReentrantCall();

    modifier nonReentrant() {
        if (entered != 1) revert ReentrantCall();
        entered = 2;
        _;
        entered = 1;
    }

    modifier onlyOwner() {
        if (msg.sender != state.owner) revert Unauthorized();
        _;
    }

    modifier onlyActive() {
        if (state.paused) revert InvalidState();
        _;
    }

    constructor(bytes32 organizationId_, address owner_, address token_, address identity_, address capabilityManager_, address withdrawalSigner_) {
        if (organizationId_ == bytes32(0) || owner_ == address(0) || token_ == address(0) || identity_ == address(0) || capabilityManager_ == address(0) || withdrawalSigner_ == address(0)) revert InvalidAddress();
        organizationId = organizationId_;
        identity = identity_;
        capabilityManager = capabilityManager_;
        withdrawalSigner = withdrawalSigner_;
        state.owner = owner_;
        state.paymentToken = token_;
    }

    function owner() external view returns (address) { return state.owner; }
    function paymentToken() external view returns (address) { return state.paymentToken; }
    function totalDeposited() external view returns (uint256) { return state.totalDeposited; }
    function totalReserved() external view returns (uint256) { return state.totalReserved; }
    function totalSpent() external view returns (uint256) { return state.totalSpent; }
    function paused() external view returns (bool) { return state.paused; }

    function balance() public view returns (uint256) {
        return IERC20Treasury(state.paymentToken).balanceOf(address(this));
    }

    function getAvailableBalance() public view returns (uint256) {
        uint256 currentBalance = balance();
        if (state.totalReserved > currentBalance) revert InvalidState();
        return currentBalance - state.totalReserved;
    }

    function deposit(uint256 amount) external nonReentrant onlyActive {
        if (amount == 0) revert InvalidAmount();
        IERC20Treasury token = IERC20Treasury(state.paymentToken);
        token.safeTransferFrom(msg.sender, address(this), amount);
        state.totalDeposited += amount;
        emit Deposited(msg.sender, amount, balance());
    }

    function withdraw(uint256 amount, address recipient, uint256 nonce, uint256 deadline, bytes calldata signature) external nonReentrant onlyActive {
        if (msg.sender != state.owner) revert Unauthorized();
        if (amount == 0 || recipient == address(0)) revert InvalidAmount();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (usedWithdrawalNonce[bytes32(nonce)]) revert NonceAlreadyUsed();
        bytes32 structHash = keccak256(abi.encode(WITHDRAW_TYPEHASH, organizationId, address(this), state.paymentToken, recipient, amount, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        if (!_validSignature(withdrawalSigner, digest, signature)) revert InvalidSignature();
        uint256 available = getAvailableBalance();
        uint256 committed = IPACTCapabilityBudget(capabilityManager).committedCapabilityBudget(address(this));
        if (committed > available || amount > available - committed) revert InsufficientAvailableBalance();
        usedWithdrawalNonce[bytes32(nonce)] = true;
        IERC20Treasury(state.paymentToken).safeTransfer(recipient, amount);
        emit Withdrawn(recipient, amount, balance());
    }

    function pause() external onlyOwner {
        if (state.paused) revert InvalidState();
        state.paused = true;
        emit TreasuryPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        if (!state.paused) revert InvalidState();
        state.paused = false;
        emit TreasuryUnpaused(msg.sender);
    }

    function reserve(bytes32 paymentId, bytes32 agentKey, address signer, uint256 amount) external onlyActive {
        if (msg.sender != capabilityManager || !IPACTIdentityAuthorization(identity).isAgentAuthorized(agentKey, signer)) revert Unauthorized();
        if (paymentId == bytes32(0) || amount == 0 || reservations[paymentId] != 0 || settled[paymentId]) revert InvalidAmount();
        if (amount > getAvailableBalance()) revert InsufficientAvailableBalance();
        reservations[paymentId] = amount;
        state.totalReserved += amount;
        emit FundsReserved(paymentId, agentKey, amount, state.totalReserved);
    }

    function settle(bytes32 paymentId, address recipient) external nonReentrant onlyActive {
        if (msg.sender != capabilityManager) revert Unauthorized();
        uint256 amount = reservations[paymentId];
        if (amount == 0 || recipient == address(0) || settled[paymentId]) revert InvalidState();
        reservations[paymentId] = 0;
        state.totalReserved -= amount;
        settled[paymentId] = true;
        state.totalSpent += amount;
        IERC20Treasury(state.paymentToken).safeTransfer(recipient, amount);
        emit PaymentSettled(paymentId, recipient, amount, state.totalReserved);
    }

    function release(bytes32 paymentId) external {
        if (msg.sender != capabilityManager) revert Unauthorized();
        uint256 amount = reservations[paymentId];
        if (amount == 0 || settled[paymentId]) revert InvalidState();
        reservations[paymentId] = 0;
        state.totalReserved -= amount;
        emit ReservationReleased(paymentId, amount, state.totalReserved);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = state.owner;
        state.owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function _domainSeparator() private view returns (bytes32) {
        return keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256("PACT Treasury"), keccak256("1"), block.chainid, address(this)));
    }

    function _validSignature(address signer, bytes32 digest, bytes calldata signature) private view returns (bool) {
        if (signer.code.length > 0) {
            try IERC1271TreasuryOwner(signer).isValidSignature(digest, signature) returns (bytes4 result) { return result == ERC1271_MAGIC_VALUE; }
            catch { return false; }
        }
        if (signature.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return false;
        return ecrecover(digest, v, r, s) == signer;
    }
}
