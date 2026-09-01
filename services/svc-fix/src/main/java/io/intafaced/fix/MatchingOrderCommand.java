package io.intafaced.fix;

/**
 * Typed matching intent. Qty/price are decimal strings copied from FIX fields.
 * This is not an execution report and not a ledger posting.
 */
public final class MatchingOrderCommand {
    public static final String KIND = "new_order_single";

    public final String kind;
    public final String clOrdId;
    public final String beginString;
    public final String applVerId;
    public final String symbol;
    public final String side;
    public final String ordType;
    public final String qty;
    public final String price;

    public MatchingOrderCommand(
            String clOrdId,
            String beginString,
            String applVerId,
            String symbol,
            String side,
            String ordType,
            String qty,
            String price) {
        this.kind = KIND;
        this.clOrdId = clOrdId;
        this.beginString = beginString;
        this.applVerId = applVerId;
        this.symbol = symbol;
        this.side = side;
        this.ordType = ordType;
        this.qty = qty;
        this.price = price;
    }

    public String toJson() {
        StringBuilder sb = new StringBuilder(256);
        sb.append('{');
        field(sb, "kind", kind, true);
        field(sb, "clOrdId", clOrdId, false);
        field(sb, "beginString", beginString, false);
        if (applVerId != null) {
            field(sb, "applVerId", applVerId, false);
        }
        field(sb, "symbol", symbol, false);
        field(sb, "side", side, false);
        field(sb, "ordType", ordType, false);
        field(sb, "qty", qty, false);
        sb.append(",\"price\":");
        if (price == null) {
            sb.append("null");
        } else {
            sb.append(Json.string(price));
        }
        sb.append('}');
        return sb.toString();
    }

    private static void field(StringBuilder sb, String name, String value, boolean first) {
        if (!first) {
            sb.append(',');
        }
        sb.append(Json.string(name)).append(':').append(Json.string(value));
    }
}
