// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./mocks/MockERC8004Registry.sol";
import "../src/PACTIdentity.sol";

interface VmIdentity {
    function prank(address sender) external;
    function expectRevert(bytes calldata revertData) external;
}

contract PACTIdentityTest {
    VmIdentity private constant vm = VmIdentity(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant owner = address(0xA11CE);
    address private constant signer = address(0xA6E);
    bytes32 private constant organizationId = keccak256("org");
    PACTIdentity private identity;
    MockERC8004Registry private registry;

    function setUp() public {
        identity = new PACTIdentity(owner);
        registry = new MockERC8004Registry();
        vm.prank(owner);
        identity.setOrganizationOwner(organizationId, owner);
        registry.register(1, address(0xBEEF), signer);
    }

    function testOwnerCanBindAndRevokeIdentity() public {
        vm.prank(owner);
        bytes32 agentKey = identity.registerAgent(organizationId, address(registry), 1, signer);
        require(identity.isAgentAuthorized(agentKey, signer), "agent not authorized");
        vm.prank(owner);
        identity.revokeAgent(agentKey);
        require(!identity.isAgentAuthorized(agentKey, signer), "revoked agent authorized");
    }

    function testNonOwnerCannotBindIdentity() public {
        vm.expectRevert(abi.encodeWithSelector(PACTIdentity.Unauthorized.selector));
        vm.prank(address(0xBAD));
        identity.registerAgent(organizationId, address(registry), 1, signer);
    }

    function testNonexistentIdentityRejected() public {
        vm.expectRevert(abi.encodeWithSelector(PACTIdentity.InvalidIdentity.selector));
        vm.prank(owner);
        identity.registerAgent(organizationId, address(registry), 99, signer);
    }

    function testWrongSignerRejected() public {
        vm.expectRevert(abi.encodeWithSelector(PACTIdentity.InvalidIdentity.selector));
        vm.prank(owner);
        identity.registerAgent(organizationId, address(registry), 1, address(0xBAD));
    }
}
