package io.intafaced.fix;

import java.util.Map;

/**
 * OWNER-SET drop-copy sockets. Independent of order-entry.
 * Blank FIX_DROPCOPY_* refuses — drop-copy is never the trading CompID.
 * Never invent owner numbers. Never share the order-entry acceptor.
 */
public final class FixDropCopyConfig {
    public static final String BEGIN_STRING_ENV = "FIX_DROPCOPY_BEGIN_STRING";
    public static final String SENDER_COMP_ID_ENV = "FIX_DROPCOPY_SENDER_COMP_ID";
    public static final String TARGET_COMP_ID_ENV = "FIX_DROPCOPY_TARGET_COMP_ID";
    public static final String SOCKET_ACCEPT_PORT_ENV = "FIX_DROPCOPY_SOCKET_ACCEPT_PORT";
    public static final String HEARTBTINT_ENV = "FIX_DROPCOPY_HEARTBTINT";
    public static final String UNCONFIGURED = "dropcopy_unconfigured";

    private FixDropCopyConfig() {}

    public static boolean requested(Map<String, String> env) {
        return nonBlank(env, BEGIN_STRING_ENV)
                || nonBlank(env, SENDER_COMP_ID_ENV)
                || nonBlank(env, TARGET_COMP_ID_ENV)
                || nonBlank(env, SOCKET_ACCEPT_PORT_ENV)
                || nonBlank(env, HEARTBTINT_ENV);
    }

    public static SessionConfigResult fromOwner(
            String productBegin,
            String senderCompId,
            String targetCompId,
            String portRaw,
            String heartRaw) {
        SessionConfigResult inner =
                FixAcceptorConfig.fromOwner(productBegin, senderCompId, targetCompId, portRaw, heartRaw, "");
        if (inner.ok) {
            return inner;
        }
        return SessionConfigResult.refuse(inner.errorCode, relabel(inner.errorMessage));
    }

    public static SessionConfigResult fromOwnerEnv(Map<String, String> env) {
        if (!requested(env)) {
            return SessionConfigResult.refuse(
                    UNCONFIGURED,
                    "FIX_DROPCOPY_* is blank; drop-copy is a second session, not the order-entry CompID");
        }
        return fromOwner(
                env.get(BEGIN_STRING_ENV),
                env.get(SENDER_COMP_ID_ENV),
                env.get(TARGET_COMP_ID_ENV),
                env.get(SOCKET_ACCEPT_PORT_ENV),
                env.get(HEARTBTINT_ENV));
    }

    /**
     * Boot path: blank drop-copy env refuses. Does not start order-entry-only
     * as a stand-in for drop-copy.
     */
    public static SessionConfigResult requireIndependent(Map<String, String> env, FixAcceptorConfig orderEntry) {
        SessionConfigResult dropCopy = fromOwnerEnv(env);
        if (!dropCopy.ok) {
            return dropCopy;
        }
        return independentOf(orderEntry, dropCopy.config);
    }

    public static SessionConfigResult independentOf(FixAcceptorConfig orderEntry, FixAcceptorConfig dropCopy) {
        if (orderEntry == null || dropCopy == null) {
            return SessionConfigResult.refuse(
                    "dropcopy_not_independent",
                    "drop-copy is not the order-entry session; svc-fix does not share a missing session");
        }
        if (orderEntry.socketAcceptPort == dropCopy.socketAcceptPort) {
            return SessionConfigResult.refuse(
                    "dropcopy_not_independent",
                    "drop-copy SocketAcceptPort equals order-entry; drop-copy is not the order-entry session");
        }
        if (orderEntry.senderCompId.equals(dropCopy.senderCompId)
                && orderEntry.targetCompId.equals(dropCopy.targetCompId)) {
            return SessionConfigResult.refuse(
                    "dropcopy_not_independent",
                    "drop-copy CompIDs equal order-entry; drop-copy is not the order-entry session");
        }
        return SessionConfigResult.accept(dropCopy);
    }

    private static boolean nonBlank(Map<String, String> env, String key) {
        String raw = env == null ? null : env.get(key);
        return raw != null && !raw.trim().isEmpty();
    }

    private static String relabel(String message) {
        return message.replace("FIX_BEGIN_STRING", BEGIN_STRING_ENV)
                .replace("FIX_SENDER_COMP_ID", SENDER_COMP_ID_ENV)
                .replace("FIX_TARGET_COMP_ID", TARGET_COMP_ID_ENV)
                .replace("FIX_SOCKET_ACCEPT_PORT", SOCKET_ACCEPT_PORT_ENV)
                .replace("FIX_HEARTBTINT", HEARTBTINT_ENV);
    }
}
