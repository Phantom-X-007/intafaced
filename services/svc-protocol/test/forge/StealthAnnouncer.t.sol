// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StealthAnnouncer} from "../../contracts/privacy/StealthAnnouncer.sol";

/// S-A8: fuzz + gas ceiling for StealthAnnouncer. No forge-std (no submodule).
contract StealthAnnouncerForgeTest {
    function test_announce_rejects_zero_address() public {
        StealthAnnouncer a = new StealthAnnouncer();
        try a.announce(1, address(0), hex"01", hex"") {
            revert("expected BadAnnouncement");
        } catch {}
    }

    function test_announce_rejects_empty_ephemeral() public {
        StealthAnnouncer a = new StealthAnnouncer();
        try a.announce(1, address(1), hex"", hex"00") {
            revert("expected BadAnnouncement");
        } catch {}
    }

    function testFuzz_announce_rejects_zero_or_empty(uint256 schemeId, bytes calldata eph, bytes calldata meta) public {
        StealthAnnouncer a = new StealthAnnouncer();
        try a.announce(schemeId, address(0), eph, meta) {
            revert("zero stealth must revert");
        } catch {}
        try a.announce(schemeId, address(1), hex"", meta) {
            revert("empty ephemeral must revert");
        } catch {}
    }

    function testFuzz_announce_happy(uint256 schemeId, address stealth, bytes calldata eph, bytes calldata meta) public {
        if (stealth == address(0) || eph.length == 0) return;
        StealthAnnouncer a = new StealthAnnouncer();
        a.announce(schemeId, stealth, eph, meta);
    }

    function test_announce_gas_ceiling() public {
        StealthAnnouncer a = new StealthAnnouncer();
        uint256 start = gasleft();
        a.announce(1, address(1), hex"01", hex"00");
        uint256 used = start - gasleft();
        // Simple emit. Drift past this bound means the announcer grew a hidden path.
        require(used < 80_000, "announce gas drifted");
    }
}
