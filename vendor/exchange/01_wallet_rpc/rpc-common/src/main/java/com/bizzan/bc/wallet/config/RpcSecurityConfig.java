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
 * <p>{@code rpc.auth-token} has no default on purpose. If it is not supplied the
 * placeholder does not resolve and the service refuses to start, which is the
 * only safe failure mode for a process that holds withdrawal keys.
 */
@Configuration
public class RpcSecurityConfig extends WebMvcConfigurerAdapter {

    /**
     * Shortest token we will accept. A wallet RPC secret is machine-to-machine,
     * so there is no reason for it to be guessable.
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
