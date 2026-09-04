package io.intafaced.fix;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * v2 S2S headers matching {@code serviceAuthHeadersForBody} in @intafaced/contracts.
 * Service name is svc-fix. Secret is INTERNAL_SERVICE_SECRET. Never unsigned.
 */
public final class ServiceAuth {
    public static final String SERVICE_NAME = "svc-fix";
    public static final String SECRET_ENV = "INTERNAL_SERVICE_SECRET";
    public static final String SERVICE_HEADER = "x-intafaced-service";
    public static final String SERVICE_TIMESTAMP_HEADER = "x-intafaced-service-ts";
    public static final String SERVICE_SIGNATURE_HEADER = "x-intafaced-service-sig";
    public static final String SERVICE_BODY_DIGEST_HEADER = "x-intafaced-service-body";
    public static final int MIN_SECRET_LENGTH = 32;
    private static final String V2_DOMAIN = "intafaced-s2s-v2";
    private static final char[] HEX = "0123456789abcdef".toCharArray();

    private ServiceAuth() {}

    public static boolean secretReady(String secret) {
        return secret != null && secret.length() >= MIN_SECRET_LENGTH;
    }

    public static Map<String, String> headersForBody(String secret, String body) {
        return headersForBody(secret, body, Instant.now().getEpochSecond());
    }

    public static Map<String, String> headersForBody(String secret, String body, long timestampSeconds) {
        String digest = sha256Hex(body == null ? "" : body);
        String preimage = serviceCallPreimage(SERVICE_NAME, timestampSeconds, digest);
        String signature = hmacSha256Hex(secret, preimage);
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put(SERVICE_HEADER, SERVICE_NAME);
        headers.put(SERVICE_TIMESTAMP_HEADER, Long.toString(timestampSeconds));
        headers.put(SERVICE_BODY_DIGEST_HEADER, digest);
        headers.put(SERVICE_SIGNATURE_HEADER, signature);
        return headers;
    }

    static String serviceCallPreimage(String service, long timestampSeconds, String bodyDigest) {
        return V2_DOMAIN
                + '\n'
                + lengthPrefixed(service)
                + lengthPrefixed(Long.toString(timestampSeconds))
                + lengthPrefixed(bodyDigest);
    }

    private static String lengthPrefixed(String value) {
        int bytes = value.getBytes(StandardCharsets.UTF_8).length;
        return bytes + ":" + value + '\n';
    }

    static String sha256Hex(String body) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return hex(digest.digest(body.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    static String hmacSha256Hex(String secret, String preimage) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return hex(mac.doFinal(preimage.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    private static String hex(byte[] bytes) {
        char[] out = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            int v = bytes[i] & 0xff;
            out[i * 2] = HEX[v >>> 4];
            out[i * 2 + 1] = HEX[v & 0x0f];
        }
        return new String(out);
    }
}
