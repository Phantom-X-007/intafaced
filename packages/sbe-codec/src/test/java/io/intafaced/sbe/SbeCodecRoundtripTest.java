package io.intafaced.sbe;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class SbeCodecRoundtripTest {
    private final SbeCodec codec = new SbeCodec();

    @Test
    void tradeRoundtripKeepsDecimalStrings() {
        String encoded = codec.handle(
                        "{\"op\":\"encode\",\"template\":\"Trade\",\"instrument\":\"BTCUSDT\",\"tradeId\":\"9\",\"side\":\"buy\",\"price\":\"100.25\",\"qty\":\"1.50\",\"eventTimeNs\":\"1\"}")
                .json;
        assertTrue(encoded.contains("\"ok\":true"), encoded);
        assertTrue(encoded.contains("\"payloadB64\""), encoded);
        assertFalse(encoded.contains("\"price\":100"), encoded);
        String b64 = extract(encoded, "payloadB64");
        String decoded = codec.handle("{\"op\":\"decode\",\"payloadB64\":\"" + b64 + "\"}").json;
        assertTrue(decoded.contains("\"ok\":true"), decoded);
        assertTrue(decoded.contains("\"template\":\"Trade\""), decoded);
        assertTrue(decoded.contains("\"price\":\"100.25\""), decoded);
        assertTrue(decoded.contains("\"qty\":\"1.5\""), decoded);
        assertTrue(decoded.contains("\"side\":\"buy\""), decoded);
        assertTrue(decoded.contains("\"instrument\":\"BTCUSDT\""), decoded);
        assertFalse(decoded.contains("\"qty\":1.5"), decoded);
        assertFalse(decoded.contains("protobuf"));
        assertFalse(decoded.contains("balance"));
        assertFalse(decoded.contains("ledger"));
    }

    @Test
    void depthLevelRoundtrip() {
        String encoded = codec.handle(
                        "{\"op\":\"encode\",\"template\":\"DepthLevel\",\"instrument\":\"ETHUSDT\",\"sequence\":\"7\",\"side\":\"sell\",\"price\":\"0.00000001\",\"qty\":\"12\",\"eventTimeNs\":\"2\"}")
                .json;
        String b64 = extract(encoded, "payloadB64");
        String decoded = codec.handle("{\"op\":\"decode\",\"payloadB64\":\"" + b64 + "\"}").json;
        assertTrue(decoded.contains("\"price\":\"0.00000001\""), decoded);
        assertTrue(decoded.contains("\"qty\":\"12\""), decoded);
        assertTrue(decoded.contains("\"side\":\"sell\""), decoded);
        assertTrue(decoded.contains("\"template\":\"DepthLevel\""), decoded);
    }

    @Test
    void jsonNumberQtyIsRefused() {
        CodecResult result = codec.handle(
                "{\"op\":\"encode\",\"template\":\"Trade\",\"instrument\":\"BTCUSDT\",\"tradeId\":\"1\",\"side\":\"buy\",\"price\":\"1\",\"qty\":1.5,\"eventTimeNs\":\"1\"}");
        assertFalse(result.ok);
        assertEquals("invalid_message", result.errorCode);
        assertTrue(result.json.contains("json numbers are refused"), result.json);
    }

    @Test
    void decimalFormatIsExact() {
        assertEquals("100.25", DecimalCodec.parse("100.25").format());
        assertEquals("1.5", DecimalCodec.parse("1.50").format());
        assertEquals("0.00000001", DecimalCodec.parse("0.00000001").format());
        assertEquals("0", DecimalCodec.parse("0").format());
        assertEquals("-2.5", DecimalCodec.parse("-2.50").format());
    }

    private static String extract(String json, String key) {
        String needle = "\"" + key + "\":\"";
        int i = json.indexOf(needle);
        if (i < 0) {
            throw new AssertionError("missing " + key + " in " + json);
        }
        int start = i + needle.length();
        int end = json.indexOf('"', start);
        return json.substring(start, end);
    }
}
