package io.intafaced.sbe;

import io.intafaced.sbe.md.DepthLevelDecoder;
import io.intafaced.sbe.md.DepthLevelEncoder;
import io.intafaced.sbe.md.MessageHeaderDecoder;
import io.intafaced.sbe.md.MessageHeaderEncoder;
import io.intafaced.sbe.md.Side;
import io.intafaced.sbe.md.TradeDecoder;
import io.intafaced.sbe.md.TradeEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import org.agrona.concurrent.UnsafeBuffer;

/**
 * Official Real Logic SBE 1.39.0 generated stubs for our schema.
 * Adapter-only: no book, no balances, no NATS.
 */
public final class SbeCodec {
    public static final String UNAVAILABLE = "sbe_unavailable";
    private static final int BUF = 256;

    public CodecResult handle(String json) {
        Map<String, String> fields;
        try {
            fields = Json.objectOfStrings(json);
        } catch (IllegalArgumentException e) {
            return CodecResult.refuse("invalid_message", e.getMessage());
        }
        String op = fields.get("op");
        if (op == null || op.isBlank()) {
            return CodecResult.refuse("missing_input", "op is missing");
        }
        return switch (op) {
            case "encode" -> encode(fields);
            case "decode" -> decode(fields);
            default -> CodecResult.refuse("unsupported_op", "op must be encode or decode");
        };
    }

    CodecResult encode(Map<String, String> fields) {
        String template = fields.get("template");
        if (template == null) {
            return CodecResult.refuse("missing_input", "template is missing");
        }
        try {
            return switch (template) {
                case "Trade" -> encodeTrade(fields);
                case "DepthLevel" -> encodeDepth(fields);
                default -> CodecResult.refuse("unsupported_template", "template must be Trade or DepthLevel");
            };
        } catch (IllegalArgumentException e) {
            return CodecResult.refuse(codeFor(e), e.getMessage());
        }
    }

    CodecResult decode(Map<String, String> fields) {
        String b64 = fields.get("payloadB64");
        if (b64 == null || b64.isBlank()) {
            return CodecResult.refuse("missing_input", "payloadB64 is missing");
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(b64);
        } catch (IllegalArgumentException e) {
            return CodecResult.refuse("invalid_message", "payloadB64 is not base64");
        }
        if (bytes.length < MessageHeaderDecoder.ENCODED_LENGTH) {
            return CodecResult.refuse("invalid_message", "payload shorter than SBE header");
        }
        UnsafeBuffer buffer = new UnsafeBuffer(bytes);
        MessageHeaderDecoder header = new MessageHeaderDecoder();
        header.wrap(buffer, 0);
        if (header.schemaId() != TradeEncoder.SCHEMA_ID) {
            return CodecResult.refuse("schema_mismatch", "schemaId " + header.schemaId() + " is not ours");
        }
        int templateId = header.templateId();
        try {
            if (templateId == TradeEncoder.TEMPLATE_ID) {
                return decodeTrade(buffer, header);
            }
            if (templateId == DepthLevelEncoder.TEMPLATE_ID) {
                return decodeDepth(buffer, header);
            }
            return CodecResult.refuse("unsupported_template", "unknown templateId " + templateId);
        } catch (IllegalArgumentException e) {
            return CodecResult.refuse(codeFor(e), e.getMessage());
        }
    }

    private CodecResult encodeTrade(Map<String, String> fields) {
        Side side = readSide(fields.get("side"));
        DecimalCodec price = DecimalCodec.parse(require(fields, "price"));
        DecimalCodec qty = DecimalCodec.parse(require(fields, "qty"));
        long tradeId = readUint64(require(fields, "tradeId"), "tradeId");
        long eventTimeNs = readUint64(require(fields, "eventTimeNs"), "eventTimeNs");
        byte[] instrument = readInstrument(require(fields, "instrument"));

        UnsafeBuffer buffer = new UnsafeBuffer(new byte[BUF]);
        TradeEncoder trade = new TradeEncoder();
        trade.wrapAndApplyHeader(buffer, 0, new MessageHeaderEncoder());
        trade.putInstrument(instrument, 0);
        trade.tradeId(tradeId);
        trade.side(side);
        trade.price().mantissa(price.mantissa).exponent(price.exponent);
        trade.qty().mantissa(qty.mantissa).exponent(qty.exponent);
        trade.eventTimeNs(eventTimeNs);
        int length = MessageHeaderEncoder.ENCODED_LENGTH + trade.encodedLength();
        return CodecResult.encoded("Trade", Arrays.copyOf(buffer.byteArray(), length));
    }

    private CodecResult encodeDepth(Map<String, String> fields) {
        Side side = readSide(fields.get("side"));
        DecimalCodec price = DecimalCodec.parse(require(fields, "price"));
        DecimalCodec qty = DecimalCodec.parse(require(fields, "qty"));
        long sequence = readUint64(require(fields, "sequence"), "sequence");
        long eventTimeNs = readUint64(require(fields, "eventTimeNs"), "eventTimeNs");
        byte[] instrument = readInstrument(require(fields, "instrument"));

        UnsafeBuffer buffer = new UnsafeBuffer(new byte[BUF]);
        DepthLevelEncoder depth = new DepthLevelEncoder();
        depth.wrapAndApplyHeader(buffer, 0, new MessageHeaderEncoder());
        depth.putInstrument(instrument, 0);
        depth.sequence(sequence);
        depth.side(side);
        depth.price().mantissa(price.mantissa).exponent(price.exponent);
        depth.qty().mantissa(qty.mantissa).exponent(qty.exponent);
        depth.eventTimeNs(eventTimeNs);
        int length = MessageHeaderEncoder.ENCODED_LENGTH + depth.encodedLength();
        return CodecResult.encoded("DepthLevel", Arrays.copyOf(buffer.byteArray(), length));
    }

    private CodecResult decodeTrade(UnsafeBuffer buffer, MessageHeaderDecoder header) {
        TradeDecoder trade = new TradeDecoder();
        trade.wrapAndApplyHeader(buffer, 0, header);
        StringBuilder sb = new StringBuilder(256);
        sb.append("{\"ok\":true,\"template\":\"Trade\"");
        field(sb, "instrument", instrument(trade.instrument()));
        field(sb, "tradeId", Long.toUnsignedString(trade.tradeId()));
        field(sb, "side", sideName(trade.side()));
        field(sb, "price", new DecimalCodec(trade.price().mantissa(), trade.price().exponent()).format());
        field(sb, "qty", new DecimalCodec(trade.qty().mantissa(), trade.qty().exponent()).format());
        field(sb, "eventTimeNs", Long.toUnsignedString(trade.eventTimeNs()));
        sb.append('}');
        return CodecResult.json(sb.toString());
    }

    private CodecResult decodeDepth(UnsafeBuffer buffer, MessageHeaderDecoder header) {
        DepthLevelDecoder depth = new DepthLevelDecoder();
        depth.wrapAndApplyHeader(buffer, 0, header);
        StringBuilder sb = new StringBuilder(256);
        sb.append("{\"ok\":true,\"template\":\"DepthLevel\"");
        field(sb, "instrument", instrument(depth.instrument()));
        field(sb, "sequence", Long.toUnsignedString(depth.sequence()));
        field(sb, "side", sideName(depth.side()));
        field(sb, "price", new DecimalCodec(depth.price().mantissa(), depth.price().exponent()).format());
        field(sb, "qty", new DecimalCodec(depth.qty().mantissa(), depth.qty().exponent()).format());
        field(sb, "eventTimeNs", Long.toUnsignedString(depth.eventTimeNs()));
        sb.append('}');
        return CodecResult.json(sb.toString());
    }

    private static String require(Map<String, String> fields, String key) {
        String v = fields.get(key);
        if (v == null || v.isBlank()) {
            throw new IllegalArgumentException(key + " is missing");
        }
        return v;
    }

    private static Side readSide(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("side is missing");
        }
        return switch (raw) {
            case "buy", "Buy" -> Side.Buy;
            case "sell", "Sell" -> Side.Sell;
            default -> throw new IllegalArgumentException("side must be buy or sell");
        };
    }

    private static String sideName(Side side) {
        if (side == Side.Buy) {
            return "buy";
        }
        if (side == Side.Sell) {
            return "sell";
        }
        throw new IllegalArgumentException("side is missing from payload");
    }

    private static long readUint64(String raw, String field) {
        try {
            return Long.parseUnsignedLong(raw);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(field + " is not an unsigned decimal integer");
        }
    }

    private static byte[] readInstrument(String raw) {
        byte[] src = raw.getBytes(StandardCharsets.US_ASCII);
        if (src.length == 0 || src.length > TradeEncoder.instrumentLength()) {
            throw new IllegalArgumentException("instrument must be 1–16 ASCII characters");
        }
        for (byte b : src) {
            if (b < 32) {
                throw new IllegalArgumentException("instrument is not printable ASCII");
            }
        }
        byte[] out = new byte[TradeEncoder.instrumentLength()];
        System.arraycopy(src, 0, out, 0, src.length);
        return out;
    }

    private static String instrument(String raw) {
        int end = raw.length();
        while (end > 0 && (raw.charAt(end - 1) == '\0' || raw.charAt(end - 1) == ' ')) {
            end--;
        }
        return raw.substring(0, end);
    }

    private static void field(StringBuilder sb, String key, String value) {
        sb.append(',').append(Json.string(key)).append(':').append(Json.string(value));
    }

    private static String codeFor(IllegalArgumentException e) {
        String m = e.getMessage() == null ? "" : e.getMessage();
        if (m.contains("missing") || m.contains("blank")) {
            return "missing_input";
        }
        if (m.contains("decimal") || m.contains("mantissa") || m.contains("exponent")) {
            return "invalid_decimal";
        }
        return "invalid_message";
    }
}
