package io.intafaced.fix;

import java.util.List;

/**
 * Completeness is false until every required source has actually published.
 * Never a certified/complete drop-copy while UI/REST/WS/algo/liquidation/RFQ/broker are missing.
 */
public final class DropCopyCompleteness {
    public final boolean complete;
    public final String errorCode;
    public final String errorMessage;
    public final List<String> included;
    public final List<String> missing;

    private DropCopyCompleteness(
            boolean complete, String errorCode, String errorMessage, List<String> included, List<String> missing) {
        this.complete = complete;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
        this.included = List.copyOf(included);
        this.missing = List.copyOf(missing);
    }

    public static DropCopyCompleteness incomplete(List<String> included, List<String> missing) {
        List<String> inc = included == null ? List.of() : List.copyOf(included);
        List<String> miss = missing == null ? List.of() : List.copyOf(missing);
        return new DropCopyCompleteness(
                false,
                "dropcopy_incomplete",
                "drop-copy is not complete; included=["
                        + String.join(",", inc)
                        + "]; missing=["
                        + String.join(",", miss)
                        + "]; svc-fix does not synthesize missing sources",
                inc,
                miss);
    }

    public static DropCopyCompleteness complete(List<String> included) {
        List<String> inc = included == null ? List.of() : List.copyOf(included);
        return new DropCopyCompleteness(true, null, null, inc, List.of());
    }

    public String toJson() {
        StringBuilder sb = new StringBuilder(256);
        if (complete) {
            sb.append("{\"ok\":true,\"complete\":true,\"included\":");
            appendStrings(sb, included);
            sb.append(",\"missing\":");
            appendStrings(sb, missing);
            sb.append('}');
            return sb.toString();
        }
        sb.append("{\"ok\":false,\"error\":{");
        sb.append("\"code\":").append(Json.string(errorCode));
        sb.append(",\"message\":").append(Json.string(errorMessage));
        sb.append(",\"included\":");
        appendStrings(sb, included);
        sb.append(",\"missing\":");
        appendStrings(sb, missing);
        sb.append("}}");
        return sb.toString();
    }

    private static void appendStrings(StringBuilder sb, List<String> values) {
        sb.append('[');
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(Json.string(values.get(i)));
        }
        sb.append(']');
    }
}
