package com.bizzan.bc.wallet.config;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import javax.annotation.PostConstruct;
import java.nio.charset.Charset;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Refuses to start unless the ECT withdrawal signing secret came from the
 * environment, and refuses outright if it is the value that was committed here.
 *
 * <p>{@code coin.withdraw-wallet} is the {@code secret} field that
 * {@code EctApi.sendFrom} POSTs to {@code coin.rpc}. Whoever holds it can move
 * every coin at {@code coin.withdraw-address}. It shipped in this repository as
 * a committed literal, which means that particular value is disclosed forever by
 * git history — rotating it is an owner action and is recorded in
 * {@code docs/OWNER-ACTIONS-WALLET-RPC-SECRETS.md}. This class only guarantees
 * the code path cannot supply one itself.
 *
 * <p><b>Why an explicit check rather than trusting the placeholder.</b>
 * {@code coin.*} is bound by {@code @ConfigurationProperties} on
 * {@code CoinConfig#getCoin}. The same properties file already carried
 * {@code rpc.auth-token=${WALLET_RPC_AUTH_TOKEN}} under a comment asserting that
 * an unresolved placeholder would stop the service — and in six sibling modules
 * that was simply false, because nothing read the property, so the placeholder
 * was never resolved and the service started wide open. "The placeholder will
 * not resolve" is an assumption about a mechanism nobody tested. This
 * {@code @PostConstruct} is a fact.
 */
@Configuration
public class EctWithdrawSecretConfig {

    /**
     * SHA-256 of the literal that was committed to this repository.
     *
     * <p>The digest is stored rather than the value so that the working tree
     * contains no copy of the secret — the point of this change is to get it out
     * of the code path, and pasting it into a denylist would put it back. The
     * check still catches the realistic mistake: an operator copying the old
     * literal out of git history into {@code ECT_WITHDRAW_WALLET_SECRET} to
     * "make it start again".
     */
    private static final String DISCLOSED_SECRET_SHA256 =
            "feafc645a12b90d5ddd2aac44494fb61ccb8ef49a2f5af0b022942ef2c7dd89b";

    @Value("${coin.withdraw-wallet}")
    private String withdrawWalletSecret;

    @PostConstruct
    public void validate() {
        if (StringUtils.isBlank(withdrawWalletSecret)) {
            throw new IllegalStateException(
                    "coin.withdraw-wallet is not set. Set the ECT_WITHDRAW_WALLET_SECRET environment variable. "
                            + "Refusing to start: this is the key that signs every ECT withdrawal.");
        }
        if (DISCLOSED_SECRET_SHA256.equals(sha256Hex(withdrawWalletSecret.trim()))) {
            throw new IllegalStateException(
                    "coin.withdraw-wallet is the value that was committed to this repository. It is public. "
                            + "Refusing to start: rotate the ECT withdrawal key and supply the new one via "
                            + "ECT_WITHDRAW_WALLET_SECRET. See docs/OWNER-ACTIONS-WALLET-RPC-SECRETS.md.");
        }
    }

    private static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(Charset.forName("UTF-8")));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandatory on every conformant JRE. If it is genuinely
            // absent, fail rather than silently skip the check.
            throw new IllegalStateException("SHA-256 unavailable; cannot verify the withdrawal secret", e);
        }
    }
}
