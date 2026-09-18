package io.intafaced.fix;

import java.util.Map;

/**
 * OWNER-SET HTTP ingest listen port for house-book fills.
 * Blank FIX_DROPCOPY_INGEST_PORT refuses — same family as FIX_DROPCOPY_SOCKET_ACCEPT_PORT.
 * Never invent a listen port.
 */
public final class DropCopyIngestConfig {
    public static final String PORT_ENV = "FIX_DROPCOPY_INGEST_PORT";
    public static final String UNCONFIGURED = "dropcopy_ingest_unconfigured";

    public final int port;

    DropCopyIngestConfig(int port) {
        this.port = port;
    }

    public static boolean requested(Map<String, String> env) {
        String raw = env == null ? null : env.get(PORT_ENV);
        return raw != null && !raw.trim().isEmpty();
    }

    public static Result fromOwner(String portRaw) {
        Integer port = parsePositiveInt(portRaw);
        if (port == null) {
            return Result.refuse(
                    UNCONFIGURED,
                    PORT_ENV + " is blank; svc-fix does not invent a listen port");
        }
        return Result.accept(new DropCopyIngestConfig(port));
    }

    public static Result fromOwnerEnv(Map<String, String> env) {
        return fromOwner(env == null ? null : env.get(PORT_ENV));
    }

    public static final class Result {
        public final boolean ok;
        public final DropCopyIngestConfig config;
        public final String errorCode;
        public final String errorMessage;

        private Result(boolean ok, DropCopyIngestConfig config, String errorCode, String errorMessage) {
            this.ok = ok;
            this.config = config;
            this.errorCode = errorCode;
            this.errorMessage = errorMessage;
        }

        static Result accept(DropCopyIngestConfig config) {
            return new Result(true, config, null, null);
        }

        static Result refuse(String code, String message) {
            return new Result(false, null, code, message);
        }
    }

    private static Integer parsePositiveInt(String raw) {
        String text = raw == null ? "" : raw.trim();
        if (text.isEmpty()) {
            return null;
        }
        try {
            int value = Integer.parseInt(text);
            if (value <= 0) {
                return null;
            }
            return value;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
