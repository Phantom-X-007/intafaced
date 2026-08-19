// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccountFactory} from "../../contracts/AccountFactory.sol";
import {SmartAccount} from "../../contracts/SmartAccount.sol";
import {UserElectedRecovery} from "../../contracts/recovery/UserElectedRecovery.sol";

/// Foundry cheatcodes without vendoring forge-std (no submodule).
interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address) external;
}

Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

bytes4 constant ERC1271_MAGIC = 0x1626ba7e;

/**
 * S-A1 wiring: a SmartAccount MAY take UserElectedRecovery as owner.
 * The factory is not defaulted to it — createAccount still takes the key it is given.
 * Runs in forge's own EVM so it cannot poison the shared CI anvil.
 */
contract RecoveryOwnerForgeTest {
    uint256 internal constant OWNER_PRIV = 0xA11CE;
    uint256 internal constant OUTSIDER_PRIV = 0xB0B;

    function _sign(uint256 priv, bytes32 digest) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(priv, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_recovery_can_own_smart_account_factory_still_takes_given_key() public {
        address ownerEoa = vm.addr(OWNER_PRIV);
        address outsider = vm.addr(OUTSIDER_PRIV);

        UserElectedRecovery recovery = new UserElectedRecovery(ownerEoa, 0);
        SmartAccount impl = new SmartAccount(address(this));
        AccountFactory factory = new AccountFactory(address(impl));

        SmartAccount recoveryOwned = SmartAccount(payable(factory.createAccount(address(recovery), bytes32(0))));
        require(recoveryOwned.owner() == address(recovery), "owner is recovery");

        bytes32 digest = keccak256("recovery-as-smart-account-owner");
        bytes4 magic = recoveryOwned.isValidSignature(digest, _sign(OWNER_PRIV, digest));
        require(magic == ERC1271_MAGIC, "1271 forwards to sitting recovery-owner");

        bytes4 refused = recoveryOwned.isValidSignature(digest, _sign(OUTSIDER_PRIV, digest));
        require(refused != ERC1271_MAGIC, "outsider must not validate");

        vm.prank(ownerEoa);
        try recoveryOwned.execute(outsider, 0, "") {
            revert("sitting EOA must not execute directly");
        } catch {}

        SmartAccount eoaOwned = SmartAccount(payable(factory.createAccount(ownerEoa, bytes32(uint256(2)))));
        require(eoaOwned.owner() == ownerEoa, "factory still takes the given key");
        require(address(eoaOwned) != address(recoveryOwned), "distinct accounts");
    }

    function test_implementation_stays_locked() public {
        SmartAccount impl = new SmartAccount(address(this));
        UserElectedRecovery recovery = new UserElectedRecovery(vm.addr(OWNER_PRIV), 0);
        try impl.initialize(address(recovery)) {
            revert("implementation must stay locked");
        } catch {}
    }
}
