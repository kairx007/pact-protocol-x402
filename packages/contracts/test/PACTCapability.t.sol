// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./mocks/MockERC20.sol";
import "./mocks/MockIdentityAuthorization.sol";
import "../src/PACTTreasury.sol";
import "../src/PACTCapability.sol";

interface VmCapability {
    function prank(address sender) external;
    function expectRevert(bytes calldata revertData) external;
}

contract PACTCapabilityTest {
    VmCapability private constant vm = VmCapability(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant owner = address(0xA11CE);
    address private constant rootSigner = address(0xA6E);
    address private constant childSigner = address(0xC11D);
    address private constant merchant = address(0xCAFE);
    bytes32 private constant organizationId = keccak256("org-cap");
    bytes32 private constant rootAgentKey = keccak256("root-agent");
    bytes32 private constant childAgentKey = keccak256("child-agent");
    bytes32 private constant service = keccak256("search-api");

    MockERC20 private token;
    MockIdentityAuthorization private identity;
    PACTCapability private capability;
    PACTTreasury private treasury;
    bytes32 private rootCapability;

    function setUp() public {
        token = new MockERC20();
        identity = new MockIdentityAuthorization();
        capability = new PACTCapability(address(identity));
        identity.setOwner(organizationId, owner);
        identity.setAgent(rootAgentKey, rootSigner, true);
        identity.setAgent(childAgentKey, childSigner, true);
        treasury = new PACTTreasury(organizationId, owner, address(token), address(identity), address(capability), address(0xBEEF));
        token.mint(owner, 2_000_000);
        vm.prank(owner);
        token.approve(address(treasury), type(uint256).max);
        vm.prank(owner);
        treasury.deposit(2_000_000);
        address[] memory tokens = _oneAddress(address(token));
        address[] memory recipients = _oneAddress(merchant);
        bytes32[] memory services = _oneService(service);
        vm.prank(owner);
        rootCapability = capability.createCapability(
            organizationId, address(treasury), rootAgentKey, 1_000_000, 500_000,
            uint64(block.timestamp), uint64(block.timestamp + 30 days), true,
            tokens, recipients, services, keccak256("root-policy")
        );
    }

    function testSpendCannotExceedCapabilityBudget() public {
        bytes32 paymentId = keccak256("payment-1");
        vm.prank(rootSigner);
        capability.reservePayment(rootCapability, paymentId, rootSigner, 400_000, address(token), merchant, service);
        vm.prank(rootSigner);
        capability.reservePayment(rootCapability, keccak256("payment-2"), rootSigner, 400_000, address(token), merchant, service);
        vm.expectRevert(abi.encodeWithSelector(PACTCapability.InsufficientBudget.selector));
        vm.prank(rootSigner);
        capability.reservePayment(rootCapability, keccak256("payment-3"), rootSigner, 201_000, address(token), merchant, service);
    }

    function testRootCapabilitiesCannotOverallocateTreasury() public {
        address[] memory tokens = _oneAddress(address(token));
        address[] memory recipients = _oneAddress(merchant);
        bytes32[] memory services = _oneService(service);
        vm.expectRevert(abi.encodeWithSelector(PACTCapability.InsufficientBudget.selector));
        vm.prank(owner);
        capability.createCapability(
            organizationId, address(treasury), childAgentKey, 1_000_001, 500_000,
            uint64(block.timestamp), uint64(block.timestamp + 1 days), false,
            tokens, recipients, services, keccak256("overallocated-root")
        );
    }

    function testCannotSettleToDifferentRecipient() public {
        bytes32 paymentId = keccak256("payment-recipient");
        vm.prank(rootSigner);
        capability.reservePayment(rootCapability, paymentId, rootSigner, 100_000, address(token), merchant, service);
        vm.expectRevert(abi.encodeWithSelector(PACTCapability.AllowlistViolation.selector));
        vm.prank(rootSigner);
        capability.settlePayment(paymentId, address(0xBAD));
    }

    function testDelegationAllocatesAndDescendantSpendPropagates() public {
        address[] memory tokens = _oneAddress(address(token));
        address[] memory recipients = _oneAddress(merchant);
        bytes32[] memory services = _oneService(service);
        vm.prank(rootSigner);
        bytes32 childId = capability.delegateCapability(
            rootCapability, childAgentKey, childSigner, 300_000, 200_000,
            uint64(block.timestamp + 10 days), tokens, recipients, services, keccak256("child-policy")
        );
        require(capability.availableBudget(rootCapability) == 700_000, "allocation not reserved");
        bytes32 paymentId = keccak256("child-payment");
        vm.prank(childSigner);
        capability.reservePayment(childId, paymentId, childSigner, 100_000, address(token), merchant, service);
        vm.prank(childSigner);
        capability.settlePayment(paymentId, merchant);
        require(capability.availableBudget(rootCapability) == 700_000, "ancestor spend not propagated");
        require(capability.availableBudget(childId) == 200_000, "child spend not recorded");
    }

    function testChildCannotExpandParentAllowlists() public {
        address[] memory tokens = _oneAddress(address(token));
        address[] memory recipients = _oneAddress(address(0xBAD));
        bytes32[] memory services = _oneService(service);
        vm.expectRevert(abi.encodeWithSelector(PACTCapability.AllowlistViolation.selector));
        vm.prank(rootSigner);
        capability.delegateCapability(
            rootCapability, childAgentKey, childSigner, 100_000, 100_000,
            uint64(block.timestamp + 5 days), tokens, recipients, services, keccak256("bad-child")
        );
    }

    function testParentRevocationInvalidatesDescendant() public {
        address[] memory tokens = _oneAddress(address(token));
        address[] memory recipients = _oneAddress(merchant);
        bytes32[] memory services = _oneService(service);
        vm.prank(rootSigner);
        bytes32 childId = capability.delegateCapability(
            rootCapability, childAgentKey, childSigner, 300_000, 200_000,
            uint64(block.timestamp + 10 days), tokens, recipients, services, keccak256("child-policy")
        );
        vm.prank(owner);
        capability.revokeCapability(rootCapability);
        require(!capability.isCapabilityActive(childId), "descendant remained active");
        require(capability.committedCapabilityBudget(address(treasury)) == 0, "revoked budget remained committed");
    }

    function testRevokingChildReturnsUnusedAllocationToParent() public {
        address[] memory tokens = _oneAddress(address(token));
        address[] memory recipients = _oneAddress(merchant);
        bytes32[] memory services = _oneService(service);
        vm.prank(rootSigner);
        bytes32 childId = capability.delegateCapability(
            rootCapability, childAgentKey, childSigner, 300_000, 200_000,
            uint64(block.timestamp + 10 days), tokens, recipients, services, keccak256("child-policy")
        );
        vm.prank(owner);
        capability.revokeCapability(childId);
        require(capability.availableBudget(rootCapability) == 1_000_000, "parent allocation not restored");
        require(capability.committedCapabilityBudget(address(treasury)) == 1_000_000, "treasury commitment changed");
    }

    function testDisabledDelegationCannotCreateChild() public {
        bytes32 nonDelegating;
        address[] memory tokens = _oneAddress(address(token));
        address[] memory recipients = _oneAddress(merchant);
        bytes32[] memory services = _oneService(service);
        vm.prank(owner);
        nonDelegating = capability.createCapability(
            organizationId, address(treasury), rootAgentKey, 100_000, 100_000,
            uint64(block.timestamp), uint64(block.timestamp + 1 days), false,
            tokens, recipients, services, keccak256("no-delegate")
        );
        vm.expectRevert(abi.encodeWithSelector(PACTCapability.DelegationNotAllowed.selector));
        vm.prank(rootSigner);
        capability.delegateCapability(
            nonDelegating, childAgentKey, childSigner, 10_000, 10_000,
            uint64(block.timestamp + 1 days), tokens, recipients, services, keccak256("child")
        );
    }

    function testRevokedAgentCannotSpendAnotherCapability() public {
        bytes32 paymentId = keccak256("revoked-payment");
        identity.setAgent(rootAgentKey, rootSigner, false);
        vm.expectRevert(abi.encodeWithSelector(PACTCapability.CapabilityInactive.selector));
        vm.prank(rootSigner);
        capability.reservePayment(rootCapability, paymentId, rootSigner, 1, address(token), merchant, service);
    }

    function testFuzzBudgetInvariant(uint96 amount) public {
        uint256 value = uint256(amount) % 500_000 + 1;
        bytes32 paymentId = keccak256(abi.encodePacked("fuzz", amount));
        vm.prank(rootSigner);
        capability.reservePayment(rootCapability, paymentId, rootSigner, uint128(value), address(token), merchant, service);
        PACTCapability.Capability memory cap = capability.getCapability(rootCapability);
        require(uint256(cap.spent) + cap.reserved + cap.childAllocated <= cap.budget, "budget invariant");
    }

    function _oneAddress(address value) private pure returns (address[] memory list) {
        list = new address[](1);
        list[0] = value;
    }

    function _oneService(bytes32 value) private pure returns (bytes32[] memory list) {
        list = new bytes32[](1);
        list[0] = value;
    }
}
