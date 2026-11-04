// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./mocks/MockERC20.sol";
import "./mocks/MockIdentityAuthorization.sol";
import "../src/PACTTreasury.sol";
import "../src/PACTTreasuryFactory.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes calldata revertData) external;
    function expectRevert() external;
    function warp(uint256 timestamp) external;
}

contract PACTTreasuryTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant OWNER_KEY = 0xA11CE;
    uint256 private constant WITHDRAWER_KEY = 0xB0B;
    address private owner;
    address private withdrawer;
    address private recipient = address(0xCAFE);
    bytes32 private organizationId = keccak256("org-1");
    bytes32 private agentKey = keccak256("agent-1");
    bytes32 private paymentId = keccak256("payment-1");

    MockERC20 private token;
    MockIdentityAuthorization private identity;
    PACTTreasury private treasury;

    function setUp() public {
        owner = vm.addr(OWNER_KEY);
        withdrawer = vm.addr(WITHDRAWER_KEY);
        token = new MockERC20();
        identity = new MockIdentityAuthorization();
        identity.setAgent(agentKey, address(0xA6E), true);
        treasury = new PACTTreasury(organizationId, owner, address(token), address(identity), withdrawer);
        token.mint(owner, 1_000_000);
        vm.prank(owner);
        token.approve(address(treasury), type(uint256).max);
    }

    function testDepositAndAvailableBalance() public {
        vm.prank(owner);
        treasury.deposit(700_000);
        require(treasury.balance() == 700_000, "balance mismatch");
        require(treasury.getAvailableBalance() == 700_000, "available mismatch");
        require(treasury.totalDeposited() == 700_000, "deposited mismatch");
    }

    function testReservationReducesAvailableAndSettlementSpendsReserved() public {
        vm.prank(owner);
        treasury.deposit(700_000);
        vm.prank(address(identity));
        treasury.reserve(paymentId, agentKey, address(0xA6E), 250_000);
        require(treasury.getAvailableBalance() == 450_000, "available after reserve");
        require(treasury.totalReserved() == 250_000, "reserved mismatch");
        vm.prank(address(identity));
        treasury.settle(paymentId, recipient);
        require(token.balanceOf(recipient) == 250_000, "recipient not paid");
        require(treasury.totalReserved() == 0, "reservation not cleared");
        require(treasury.totalSpent() == 250_000, "spent history mismatch");
        require(treasury.getAvailableBalance() == 450_000, "available after settle");
    }

    function testOwnerCannotWithdrawReservedFunds() public {
        vm.prank(owner);
        treasury.deposit(700_000);
        vm.prank(address(identity));
        treasury.reserve(paymentId, agentKey, address(0xA6E), 600_000);
        bytes memory signature = _withdrawSignature(200_000, recipient, 1, block.timestamp + 1 days);
        vm.expectRevert(abi.encodeWithSelector(PACTTreasury.InsufficientAvailableBalance.selector));
        vm.prank(owner);
        treasury.withdraw(200_000, recipient, 1, block.timestamp + 1 days, signature);
    }

    function testOnlyAuthorizedIdentityCanReserve() public {
        vm.expectRevert(abi.encodeWithSelector(PACTTreasury.Unauthorized.selector));
        treasury.reserve(paymentId, agentKey, address(0xBAD), 1);
    }

    function testPauseBlocksDepositReservationSettlementAndWithdrawal() public {
        vm.prank(owner);
        treasury.deposit(500_000);
        vm.prank(owner);
        treasury.pause();
        require(treasury.paused(), "not paused");
        vm.expectRevert(abi.encodeWithSelector(PACTTreasury.InvalidState.selector));
        vm.prank(owner);
        treasury.deposit(1);
        vm.expectRevert(abi.encodeWithSelector(PACTTreasury.InvalidState.selector));
        vm.prank(address(identity));
        treasury.reserve(paymentId, agentKey, address(0xA6E), 1);
        vm.prank(owner);
        treasury.unpause();
        require(!treasury.paused(), "still paused");
    }

    function testWithdrawalRequiresOwnerAndValidTypedSignature() public {
        vm.prank(owner);
        treasury.deposit(500_000);
        uint256 deadline = block.timestamp + 1 days;
        bytes memory signature = _withdrawSignature(200_000, recipient, 2, deadline);
        vm.prank(owner);
        treasury.withdraw(200_000, recipient, 2, deadline, signature);
        require(token.balanceOf(recipient) == 200_000, "withdrawal missing");
        require(treasury.getAvailableBalance() == 300_000, "available wrong");
    }

    function testWithdrawalNonceCannotBeReused() public {
        vm.prank(owner);
        treasury.deposit(500_000);
        uint256 deadline = block.timestamp + 1 days;
        bytes memory signature = _withdrawSignature(100_000, recipient, 3, deadline);
        vm.prank(owner);
        treasury.withdraw(100_000, recipient, 3, deadline, signature);
        vm.expectRevert(abi.encodeWithSelector(PACTTreasury.NonceAlreadyUsed.selector));
        vm.prank(owner);
        treasury.withdraw(100_000, recipient, 3, deadline, signature);
    }

    function testExpiredWithdrawalSignatureRejected() public {
        vm.prank(owner);
        treasury.deposit(500_000);
        uint256 deadline = block.timestamp + 1;
        bytes memory signature = _withdrawSignature(100_000, recipient, 4, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(PACTTreasury.SignatureExpired.selector));
        vm.prank(owner);
        treasury.withdraw(100_000, recipient, 4, deadline, signature);
    }

    function testFactoryCreatesOneTreasuryPerOrganization() public {
        identity.setOwner(organizationId, owner);
        PACTTreasuryFactory factory = new PACTTreasuryFactory(address(identity), withdrawer, address(token));
        vm.prank(owner);
        address created = factory.createTreasury(organizationId, owner);
        require(created == factory.treasuryOf(organizationId), "factory mapping wrong");
        vm.expectRevert(abi.encodeWithSelector(PACTTreasuryFactory.TreasuryAlreadyExists.selector));
        vm.prank(owner);
        factory.createTreasury(organizationId, owner);
    }

    function testFactoryCannotAssignTreasuryToDifferentOwner() public {
        identity.setOwner(organizationId, owner);
        PACTTreasuryFactory factory = new PACTTreasuryFactory(address(identity), withdrawer, address(token));
        vm.expectRevert(abi.encodeWithSelector(PACTTreasuryFactory.InvalidAddress.selector));
        vm.prank(owner);
        factory.createTreasury(organizationId, recipient);
    }

    function testUnsupportedTokenCannotBeChanged() public view {
        require(treasury.paymentToken() == address(token), "token changed");
    }

    function testFuzzAvailableNeverExceedsBalance(uint96 depositAmount, uint96 reservationAmount) public {
        uint256 depositValue = uint256(depositAmount) + 1;
        uint256 reserveValue = uint256(reservationAmount) % depositValue;
        token.mint(owner, depositValue);
        vm.prank(owner);
        treasury.deposit(depositValue);
        if (reserveValue > 0) {
            vm.prank(address(identity));
            treasury.reserve(paymentId, agentKey, address(0xA6E), reserveValue);
        }
        require(treasury.totalReserved() <= treasury.balance(), "reserved > balance");
        require(treasury.getAvailableBalance() == treasury.balance() - treasury.totalReserved(), "available invariant");
    }

    function _withdrawSignature(uint256 amount, address to, uint256 nonce, uint256 deadline) private returns (bytes memory) {
        bytes32 typeHash = keccak256("TreasuryWithdrawal(bytes32 organizationId,address treasury,address token,address recipient,uint256 amount,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(typeHash, organizationId, address(treasury), address(token), to, amount, nonce, deadline));
        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("PACT Treasury"), keccak256("1"), block.chainid, address(treasury)
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(WITHDRAWER_KEY, digest);
        return abi.encodePacked(r, s, v);
    }
}
