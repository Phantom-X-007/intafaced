package com.bizzan.bitrade.interceptor;

import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

import java.io.IOException;

/**
 * Attaches the wallet RPC shared secret to outbound calls.
 *
 * <p>Pairs with RpcAuthInterceptor in the wallet RPC services (01_wallet_rpc),
 * which reject any /rpc/** request that does not carry this header. Only the
 * modules that actually talk to the wallet RPC services register it, so no
 * other service is forced to hold the secret.
 *
 * <p>This class deliberately does not read configuration itself: the token is
 * passed in, so that only the modules that need it fail to start when it is
 * missing.
 */
public class RpcAuthRequestInterceptor implements ClientHttpRequestInterceptor {

    public static final String HEADER = "X-Rpc-Auth-Token";

    private final String token;

    public RpcAuthRequestInterceptor(String token) {
        if (token == null || token.trim().isEmpty()) {
            throw new IllegalStateException(
                    "rpc.auth-token is not set. Set the WALLET_RPC_AUTH_TOKEN environment variable. "
                            + "Refusing to start: wallet RPC calls would be rejected and withdrawals would silently fall back to manual handling.");
        }
        this.token = token.trim();
    }

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
            throws IOException {
        request.getHeaders().set(HEADER, token);
        return execution.execute(request, body);
    }
}
