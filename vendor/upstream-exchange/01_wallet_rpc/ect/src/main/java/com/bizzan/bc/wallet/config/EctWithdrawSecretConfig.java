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

    /** A SHA-256 digest is 32 bytes, so exactly 64 lowercase hex digits. Nothing else can equal one. */
    private static final int SHA256_HEX_DIGITS = 64;

    /**
     * SHA-256 of the literal that was committed to this repository.
     *
     * <p>The digest is stored rather than the value so that the working tree
     * contains no copy of the secret — the point of this change is to get it out
     * of the code path, and pasting it into a denylist would put it back. The
     * check still catches the realistic mistake: an operator copying the old
     * literal out of git history into {@code ECT_WITHDRAW_WALLET_SECRET} to
     * "make it start again".
     *
     * <p><b>Why the width is asserted rather than assumed.</b> Every one of the
     * seven malformed hex constants the 2026-08-06 audit found in this tree
     * (review §7.4) is exactly one digit short, and six of them fail closed. This
     * constant is the counter-example that made the audit worth doing: it is
     * <i>ours</i>, and dropping a digit from it fails <b>open</b>. A 63-digit
     * string cannot equal any SHA-256 hex string, so {@code equals} at
     * {@link #validate()} becomes permanently false, the "you have pasted the
     * disclosed secret back in" check silently stops firing, and this service
     * boots on the compromised key that signs every ECT withdrawal — with no
     * error, no log line, and nothing anywhere to notice.
     *
     * <p>So the width is structural. {@link #requireSha256Hex(String)} runs in
     * the static initialiser, at class load, before Spring can construct this
     * bean: mangle the literal and the module does not boot with a dead guard, it
     * does not boot at all. That is the failure direction this guard is supposed
     * to have. Note this is not something a unit test could cover here anyway —
     * {@code ect/pom.xml} configures {@code maven-surefire-plugin} with
     * {@code <skip>true</skip>}, so a JUnit assertion in this module would never
     * run. Rule M11 of {@code tooling/ci/wallet-rpc-mainnet-scan.mjs} is the
     * check that does run in CI, and it reads this literal directly.
     */
    private static final String DISCLOSED_SECRET_SHA256 =
            requireSha256Hex("feafc645a12b90d5ddd2aac44494fb61ccb8ef49a2f5af0b022942ef2c7dd89b");

    /**
     * Returns {@code digest} if it is a well-formed lowercase SHA-256 hex string,
     * and throws otherwise.
     *
     * <p>Lowercase is required, not merely tolerated: {@link #sha256Hex(String)}
     * emits lowercase, and {@link String#equals} is case-sensitive, so an
     * uppercase digest here would be exactly as permanently-false as a short one
     * — the same silent fail-open by a different route.
     */
    private static String requireSha256Hex(String digest) {
        if (digest == null || digest.length() != SHA256_HEX_DIGITS || !digest.matches("[0-9a-f]{" + SHA256_HEX_DIGITS + "}")) {
            throw new IllegalStateException(
                    "DISCLOSED_SECRET_SHA256 is not a SHA-256 digest: expected " + SHA256_HEX_DIGITS
                            + " lowercase hex digits, got " + (digest == null ? "null" : digest.length() + " chars (\"" + digest + "\")")
                            + ". A value of any other shape can never equal a computed digest, which would silently disable the "
                            + "check that stops this service booting on the disclosed ECT withdrawal secret. Refusing to load.");
        }
        return digest;
    }

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
            // The other side of the same comparison. If this ever stops being 64
            // digits — someone "simplifies" the algorithm string, say — then
            // equals() below is permanently false and the guard silently stops
            // firing, which is the identical fail-open the constant's width check
            // above exists to prevent. Both operands, or neither.
            if (hex.length() != SHA256_HEX_DIGITS) {
                throw new IllegalStateException(
                        "sha256Hex produced " + hex.length() + " hex digits, not " + SHA256_HEX_DIGITS
                                + ". It cannot be compared against a SHA-256 digest, so the disclosed-secret check would "
                                + "silently never fire. Refusing to continue.");
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandatory on every conformant JRE. If it is genuinely
            // absent, fail rather than silently skip the check.
            throw new IllegalStateException("SHA-256 unavailable; cannot verify the withdrawal secret", e);
        }
    }
}
