// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccountFactory} from "../../contracts/AccountFactory.sol";
import {CardPull} from "../../contracts/card/CardPull.sol";
import {SessionKeyLib} from "../../contracts/SessionKeyLib.sol";
import {SmartAccount} from "../../contracts/SmartAccount.sol";
import {MockERC20} from "../../contracts/test/MockERC20.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
}

Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

/// S-E1: exact pull from the user's account; kill strands zero; session may pullExact.
contract CardPullForgeTest {
    function test_pullExact_moves_owner_tokens_to_user_settlement() public {
        MockERC20 token = new MockERC20();
        address settlement = address(0x5e11);
        CardPull pull = new CardPull(address(this), address(token), settlement);
        token.mint(address(this), 100);
        token.approve(address(pull), 40);
        pull.pullExact(40);
        require(token.balanceOf(settlement) == 40, "settlement received");
        require(token.balanceOf(address(this)) == 60, "remainder stays with owner");
        require(token.balanceOf(address(pull)) == 0, "contract never holds");
    }

    function test_kill_refuses_further_pulls_and_strands_zero() public {
        MockERC20 token = new MockERC20();
        CardPull pull = new CardPull(address(this), address(token), address(0x5e11));
        token.mint(address(this), 100);
        token.approve(address(pull), 100);
        pull.kill();
        try pull.pullExact(10) {
            revert("killed must refuse");
        } catch {}
        require(token.balanceOf(address(this)) == 100, "kill strands zero user funds");
        require(token.balanceOf(address(pull)) == 0, "nothing stuck in pull");
    }

    function test_stranger_cannot_pull_or_kill() public {
        MockERC20 token = new MockERC20();
        CardPull pull = new CardPull(address(this), address(token), address(0x5e11));
        token.mint(address(this), 100);
        token.approve(address(pull), 100);
        CardPullStranger s = new CardPullStranger();
        try s.pull(pull, 1) {
            revert("stranger pull");
        } catch {}
        try s.kill(pull) {
            revert("stranger kill");
        } catch {}
        require(token.balanceOf(address(this)) == 100, "untouched");
    }

    function test_smart_account_owner_session_may_pullExact() public {
        MockERC20 token = new MockERC20();
        SmartAccount impl = new SmartAccount(address(this));
        AccountFactory factory = new AccountFactory(address(impl));
        SmartAccount account = SmartAccount(payable(factory.createAccount(address(this), bytes32(uint256(7)))));

        address settlement = address(0x5e11);
        CardPull pull = new CardPull(address(account), address(token), settlement);
        token.mint(address(account), 80);

        account.execute(address(token), 0, abi.encodeWithSelector(token.approve.selector, address(pull), uint256(80)));

        address sessionKey = vm.addr(0x51);
        SessionKeyLib.SessionSpec memory spec;
        spec.key = sessionKey;
        spec.validAfter = 0;
        spec.validUntil = uint48(block.timestamp + 1 days);
        spec.spendLimitWei = 0;
        spec.targets = new address[](1);
        spec.targets[0] = address(pull);
        spec.selectors = new bytes4[](1);
        spec.selectors[0] = CardPull.pullExact.selector;
        account.grantSession(spec);

        vm.prank(sessionKey);
        account.executeWithSession(spec, address(pull), 0, abi.encodeWithSelector(CardPull.pullExact.selector, uint256(25)));

        require(token.balanceOf(settlement) == 25, "session pullExact");
        require(token.balanceOf(address(account)) == 55, "remainder in SA");
        require(token.balanceOf(address(pull)) == 0, "contract empty");
    }
}

contract CardPullStranger {
    function pull(CardPull p, uint256 amount) external {
        p.pullExact(amount);
    }

    function kill(CardPull p) external {
        p.kill();
    }
}
