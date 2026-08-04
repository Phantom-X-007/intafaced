package com.bizzan.bc.wallet.config;

import org.apache.commons.lang3.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.ModelAndView;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.PrintWriter;
import java.nio.charset.Charset;

/**
 * Requires a shared secret on every wallet RPC call.
 *
 * <p>Before this existed the wallet RPC services had no authentication of any
 * kind: {@code GET /rpc/withdraw?address=...&amount=...} moved coins out of the
 * hot wallet for anyone who could open a socket to the port. These services are
 * only ever called by other services in the cluster, so a shared secret in a
 * header is the appropriate control - but it has to actually be present.
 *
 * <p>Fails closed: no token configured means the service does not start (see
 * {@link RpcSecurityConfig}); no token on the request means 401.
 */
public class RpcAuthInterceptor implements HandlerInterceptor {

    public static final String HEADER = "X-Rpc-Auth-Token";

    private final String expectedToken;

    public RpcAuthInterceptor(String expectedToken) {
        this.expectedToken = expectedToken;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        String presented = request.getHeader(HEADER);
        if (!constantTimeEquals(expectedToken, presented)) {
            // Deliberately terse: do not tell an unauthenticated caller whether
            // the header was missing, short, or merely wrong.
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setCharacterEncoding("UTF-8");
            response.setContentType("application/json; charset=UTF-8");
            PrintWriter out = response.getWriter();
            out.print("{\"code\":401,\"message\":\"unauthorized\"}");
            out.flush();
            return false;
        }
        return true;
    }

    /**
     * Compares without leaking the position of the first differing byte.
     */
    private static boolean constantTimeEquals(String expected, String presented) {
        if (StringUtils.isEmpty(expected) || StringUtils.isEmpty(presented)) {
            return false;
        }
        byte[] a = expected.getBytes(Charset.forName("UTF-8"));
        byte[] b = presented.getBytes(Charset.forName("UTF-8"));
        int diff = a.length ^ b.length;
        for (int i = 0; i < a.length && i < b.length; i++) {
            diff |= a[i] ^ b[i];
        }
        return diff == 0;
    }

    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler,
                           ModelAndView modelAndView) throws Exception {
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler,
                                Exception ex) throws Exception {
    }
}
