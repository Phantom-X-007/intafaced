package com.bizzan.bitrade.interceptor;

import lombok.extern.slf4j.Slf4j;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.ModelAndView;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Dual-book Option B — money door kill (INTAFACED order-route · Architect Seam A1).
 *
 * <p>The TS ledger is the only balance of record. Vendored HTTP paths that mutate
 * the Java second book are refused at the door (410 Gone) so residual controllers
 * are not merely "unused" — they are unreachable.
 *
 * <p>Path list is inventory-driven from the dual-book money controllers (P2-1).
 * Fail-closed on these prefixes; everything else is untouched. Service-layer
 * throws + DAO no-ops remain defense-in-depth for non-HTTP callers.
 *
 * <p>Class M posture — Denon carve-out may apply on merge.
 */
@Slf4j
public class DualBookMoneyDoorInterceptor implements HandlerInterceptor {

    /**
     * Substrings matched against the request URI (case-insensitive). Keep this
     * list in lockstep with docs/ORDER-ROUTE-VENDOR-MONEY-INVENTORY.md controllers.
     */
    private static final List<String> BLOCKED_URI_FRAGMENTS = Arrays.asList(
            // admin member wallet mutators (DAO + entity setBalance)
            "/member/member-wallet/recharge",
            "/member/member-wallet/balance",
            "/member/member-wallet/lock-wallet",
            "/member/member-wallet/unlock-wallet",
            // admin member business audit / cancel (entity setFrozenBalance)
            "/audit-business",
            "/cancel-business",
            // admin CTC complete/pay/cancel moves balances
            "/ctc/order/complete-order",
            "/ctc/order/pay-order",
            "/ctc/order/cancel-order",
            "/ctc/order/confirm-order",
            // admin activity distribute
            "/activity/activity/distribute",
            // admin dividend — entity setBalance + save (was uncovered HTTP mint)
            "/system/dividend",
            // admin OTC appeal release / cancel
            "/otc/appeal/release-coin",
            "/otc/appeal/cancel-order",
            // admin withdraw record money (entity frozen debit)
            "/finance/withdraw-record/audit-pass",
            "/finance/withdraw-record/audit-no-pass",
            "/finance/withdraw-record/add-transaction-number",
            "/finance/withdraw-record/remittance",
            // admin business cancel apply (entity setBalance)
            "/business/cancel-apply/check",
            // admin + ucenter legal wallet rails
            "/legal-wallet-recharge",
            "/legal-wallet-withdraw",
            // ucenter withdraw apply
            "/withdraw/apply",
            // ucenter CTC order place/cancel/pay
            "/ctc/new-ctc-order",
            "/ctc/cancel-ctc-order",
            "/ctc/pay-ctc-order",
            // ucenter business deposit freeze + red envelope receive (entity setBalance)
            "/approve/certified/business/apply",
            "/approve/cancel/business",
            "/redenvelope/receive",
            "/redenvelope/receivelogin",
            // otc order money lifecycle
            "/order/buy",
            "/order/sell",
            "/order/cancel",
            "/order/pay",
            "/order/release",
            // otc advertise freezes
            "/advertise/create",
            "/advertise/update",
            "/advertise/on/shelves",
            "/advertise/off/shelves",
            "/advertise/delete",
            // exchange-api order place/cancel (second book if still wired)
            "/order/add"
    );

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        String uri = request.getRequestURI();
        if (uri == null) {
            return true;
        }
        String path = uri.toLowerCase(Locale.ROOT);
        for (String fragment : BLOCKED_URI_FRAGMENTS) {
            if (path.contains(fragment.toLowerCase(Locale.ROOT))) {
                log.warn("dual-book door-kill refused money path: {}", uri);
                refuse(response);
                return false;
            }
        }
        return true;
    }

    private static void refuse(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_GONE); // 410
        response.setCharacterEncoding("UTF-8");
        response.setContentType("application/json; charset=UTF-8");
        PrintWriter out = response.getWriter();
        out.print(
                "{\"code\":410,\"message\":\"dual-book door: Java money path disabled; ledger is the only book\"}");
        out.flush();
        out.close();
    }

    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler,
                           ModelAndView modelAndView) {
        // no-op
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler,
                                Exception ex) {
        // no-op
    }
}
