package com.bizzan.bc.wallet.config;

import com.bizzan.bc.wallet.entity.Coin;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

/**
 * Refuses to start an Ethereum-family wallet RPC service unless the keystore
 * passwords are actually configured.
 *
 * <p>The original code unlocked deposit keystores with the literal empty string
 * and shipped the hot-wallet password in application.properties. Both are
 * treated here as a hard startup failure rather than something to default. A
 * service that will not start is an outage; a service that starts with an
 * empty-password keystore is a loss of custody.
 *
 * <p>Only active where a keystore is in use (coin.keystore-path is set), so the
 * non-keystore RPC services are unaffected.
 */
@Component
@ConditionalOnProperty(name = "coin.keystore-path")
public class KeystorePasswordValidator {

    @Autowired
    private Coin coin;

    @PostConstruct
    public void validate() {
        if (StringUtils.isBlank(coin.getKeystorePassword())) {
            throw new IllegalStateException(
                    "coin.keystore-password is not set. Set the ETH_KEYSTORE_PASSWORD environment variable. "
                            + "Refusing to start: deposit keystores would otherwise be created and unlocked with an empty password.");
        }
        if (StringUtils.isBlank(coin.getWithdrawWallet())) {
            return;
        }
        if (StringUtils.isBlank(coin.getWithdrawWalletPassword())) {
            throw new IllegalStateException(
                    "coin.withdraw-wallet-password is not set. Set the ETH_WITHDRAW_WALLET_PASSWORD environment variable. "
                            + "Refusing to start: the hot withdraw wallet would otherwise be unlocked with an empty password.");
        }
    }
}
