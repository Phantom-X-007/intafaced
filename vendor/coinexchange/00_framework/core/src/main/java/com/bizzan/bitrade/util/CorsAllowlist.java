package com.bizzan.bitrade.util;

import org.springframework.web.cors.CorsConfiguration;

/**
 * Explicit browser origins for the vendored exchange shell.
 *
 * <p>Upstream used {@code addAllowedOrigin("*")} with {@code setAllowCredentials(true)},
 * which is both invalid under the CORS spec and an open cross-site door. The shell is
 * product UI only — not the money books — but it still must not accept every origin
 * with credentials.
 *
 * <p>Default allowlist is local shell / app ports. Production must set
 * {@code CORS_ALLOWED_ORIGINS} (comma-separated full origins, e.g.
 * {@code https://app.example.com,https://www.example.com}). A bare {@code *} is
 * ignored so the door cannot be reopened by env mistake.
 */
public final class CorsAllowlist {

    /**
     * Local product shell (:8090) and common app ports. Not production domains —
     * those require an explicit env list (Nitro / Denon decide).
     */
    public static final String DEFAULT_ORIGINS =
            "http://localhost:8090,"
                    + "http://127.0.0.1:8090,"
                    + "http://localhost:8080,"
                    + "http://127.0.0.1:8080,"
                    + "http://localhost:3000,"
                    + "http://127.0.0.1:3000,"
                    + "http://localhost:5173,"
                    + "http://127.0.0.1:5173";

    private CorsAllowlist() {}

    /** Apply origin allowlist + credentials-safe defaults onto {@code config}. */
    public static void apply(CorsConfiguration config) {
        String raw = System.getenv("CORS_ALLOWED_ORIGINS");
        if (raw == null || raw.trim().isEmpty()) {
            raw = System.getProperty("cors.allowed.origins", DEFAULT_ORIGINS);
        }
        int added = 0;
        for (String part : raw.split(",")) {
            String origin = part.trim();
            if (origin.isEmpty() || "*".equals(origin)) {
                continue;
            }
            config.addAllowedOrigin(origin);
            added++;
        }
        // Empty allowlist = no browser CORS (fail closed), never restore "*".
        if (added == 0) {
            // Spring still needs at least one entry for some clients in local smoke;
            // keep the documented local shell origin so a mis-set env does not
            // silently open the world.
            config.addAllowedOrigin("http://localhost:8090");
        }
        config.setAllowCredentials(true);
        config.addAllowedHeader("*");
        config.addAllowedMethod("*");
    }
}
