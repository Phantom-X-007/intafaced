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
 * <p><b>Why this class is duplicated per module rather than inherited.</b> The
 * canonical copy lives in {@code rpc-common}. This module does not depend on
 * {@code rpc-common} and cannot be made to: {@code rpc-common} ships its own
 * {@code com.bizzan.bc.wallet.config.CoinConfig}, {@code KafkaConfiguration} and
 * {@code MongodbConfig}, and this module already has classes at those exact
 * fully-qualified names. Putting both on one classpath makes it undefined which
 * definition wins. Duplicating the two security classes is the smaller evil, and
 * it matches how the vendored tree already duplicates the other three.
 *
 * <p><b>What went wrong before this existed.</b> {@code rpc.auth-token} was
 * present in this module's {@code application.properties} with a comment saying
 * the service would refuse to start without it. That was never true here.
 * Nothing on this module's classpath read the property, so Spring never resolved
 * the placeholder, and {@code /rpc/**} was served to anyone who could open a
 * socket to the port. An unresolved placeholder is only fatal if something
 * actually asks for the value.
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
