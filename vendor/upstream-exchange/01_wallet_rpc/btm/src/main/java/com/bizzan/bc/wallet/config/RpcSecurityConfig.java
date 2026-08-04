package com.bizzan.bc.wallet.config;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurerAdapter;

import javax.annotation.PostConstruct;

/**
 * Puts {@link RpcAuthInterceptor} in front of every wallet RPC endpoint.
 *
 * <p>What this module exposes without it: GET /rpc/address/{account} creates a
 * receiving address on the configured Bytom node; GET /rpc/withdraw and
 * GET /rpc/transfer move coins out of the hot wallet, signing with the key alias
 * whose password is {@code BYTOM_WALLET_PASSWORD}.
 *
 * <p><b>Why this class is duplicated here instead of coming from
 * {@code rpc-common}.</b> See the note on {@link RpcAuthInterceptor}: this module
 * cannot take a dependency on {@code rpc-common} without two definitions of
 * {@code CoinConfig}, {@code KafkaConfiguration} and {@code MongodbConfig}
 * landing on one classpath at the same fully-qualified names.
 *
 * <p>{@code rpc.auth-token} has no default on purpose. The {@code @Value}
 * injection below is what makes the missing property fatal — without a reader,
 * an unresolved {@code ${...}} placeholder in a properties file is silently
 * ignored and the service starts wide open. That is precisely the failure this
 * module shipped with. The {@code @PostConstruct} check is deliberately explicit
 * rather than relying on placeholder resolution alone, because "the placeholder
 * will not resolve" was the assumption that turned out to be wrong.
 */
@Configuration
public class RpcSecurityConfig extends WebMvcConfigurerAdapter {

    /**
     * Shortest token we will accept. A wallet RPC secret is machine-to-machine,
     * so there is no reason for it to be guessable. Matches the {@code rpc-common}
     * copy; do not lower it to make an environment start.
     */
    private static final int MIN_TOKEN_LENGTH = 32;

    @Value("${rpc.auth-token}")
    private String authToken;

    @PostConstruct
    public void validate() {
        if (StringUtils.isBlank(authToken)) {
            throw new IllegalStateException(
                    "rpc.auth-token is not set. Set the WALLET_RPC_AUTH_TOKEN environment variable. "
                            + "Refusing to start: the withdrawal endpoints would otherwise be open to anyone who can reach the port.");
        }
        if (authToken.trim().length() < MIN_TOKEN_LENGTH) {
            throw new IllegalStateException(
                    "rpc.auth-token is shorter than " + MIN_TOKEN_LENGTH + " characters. Refusing to start.");
        }
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new RpcAuthInterceptor(authToken.trim())).addPathPatterns("/**");
        super.addInterceptors(registry);
    }
}
