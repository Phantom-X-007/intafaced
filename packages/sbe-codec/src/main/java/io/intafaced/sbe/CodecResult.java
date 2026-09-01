package io.intafaced.sbe;

import java.util.Base64;

public final class CodecResult {
    public final boolean ok;
    public final String json;
    public final String errorCode;

    private CodecResult(boolean ok, String json, String errorCode) {
        this.ok = ok;
        this.json = json;
        this.errorCode = errorCode;
    }

    public static CodecResult encoded(String template, byte[] payload) {
        StringBuilder sb = new StringBuilder(128 + payload.length);
        sb.append("{\"ok\":true,\"template\":")
                .append(Json.string(template))
                .append(",\"payloadB64\":")
                .append(Json.string(Base64.getEncoder().encodeToString(payload)))
                .append('}');
        return new CodecResult(true, sb.toString(), null);
    }

    public static CodecResult json(String json) {
        return new CodecResult(true, json, null);
    }

    public static CodecResult refuse(String code, String message) {
        String body = "{\"ok\":false,\"error\":{\"code\":"
                + Json.string(code)
                + ",\"message\":"
                + Json.string(message)
                + "}}";
        return new CodecResult(false, body, code);
    }
}
