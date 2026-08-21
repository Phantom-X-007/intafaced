// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RwaRegistry} from "../../contracts/rwa/RwaRegistry.sol";

/// S-G4: zero licence hash refuses; a set hash lets the issuer list and unlist.
contract RwaRegistryForgeTest {
    bytes32 internal constant LICENCE = keccak256("licence-hash-is-not-content");
    bytes32 internal constant ASSET = keccak256("asset-commitment-not-pii");

    function test_zero_licence_refuses_register() public {
        RwaRegistry r = new RwaRegistry(bytes32(0));
        try r.register(address(0xBEEF), ASSET) {
            revert("zero licence must refuse");
        } catch {}
    }

    function test_zero_licence_refuses_unlist() public {
        RwaRegistry r = new RwaRegistry(bytes32(0));
        try r.unlist(address(0xBEEF)) {
            revert("zero licence must refuse unlist");
        } catch {}
    }

    function test_set_licence_register_and_unlist() public {
        RwaRegistry r = new RwaRegistry(LICENCE);
        r.register(address(0xBEEF), ASSET);
        (address token, bytes32 commitment, address issuer, bool listed) = r.byToken(address(0xBEEF));
        require(token == address(0xBEEF), "token");
        require(commitment == ASSET, "commitment");
        require(issuer == address(this), "issuer is registrar");
        require(listed, "listed");
        r.unlist(address(0xBEEF));
        (, , , bool still) = r.byToken(address(0xBEEF));
        require(!still, "issuer unlisted");
    }

    function test_stranger_cannot_unlist() public {
        RwaRegistry r = new RwaRegistry(LICENCE);
        r.register(address(0xBEEF), ASSET);
        RwaRegistryStranger s = new RwaRegistryStranger();
        try s.unlist(r, address(0xBEEF)) {
            revert("stranger must not unlist");
        } catch {}
    }

    function test_zero_token_or_commitment_refused() public {
        RwaRegistry r = new RwaRegistry(LICENCE);
        try r.register(address(0), ASSET) {
            revert("zero token");
        } catch {}
        try r.register(address(0xBEEF), bytes32(0)) {
            revert("zero commitment");
        } catch {}
    }
}

contract RwaRegistryStranger {
    function unlist(RwaRegistry r, address token) external {
        r.unlist(token);
    }
}
