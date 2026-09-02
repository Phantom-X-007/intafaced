package io.intafaced.fix;

/**
 * Completeness is false until every required source is included.
 * Never a certified/complete drop-copy while UI/REST/WS/algo/liquidation/RFQ/broker are missing.
 */
public final class DropCopyCompleteness {
    public final boolean complete;
    public final String errorCode;
    public final String errorMessage;

    private DropCopyCompleteness(boolean complete, String errorCode, String errorMessage) {
        this.complete = complete;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }

    public static DropCopyCompleteness incomplete() {
        return new DropCopyCompleteness(
                false,
                "dropcopy_incomplete",
                "drop-copy is not complete; included=["
                        + String.join(",", DropCopyCatalog.INCLUDED)
                        + "]; missing=["
                        + String.join(",", DropCopyCatalog.MISSING)
                        + "]; svc-fix does not synthesize missing sources");
    }

    public String toJson() {
        StringBuilder sb = new StringBuilder(256);
        sb.append("{\"ok\":false,\"error\":{");
        sb.append("\"code\":").append(Json.string(errorCode));
        sb.append(",\"message\":").append(Json.string(errorMessage));
        sb.append(",\"included\":[");
        for (int i = 0; i < DropCopyCatalog.INCLUDED.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(Json.string(DropCopyCatalog.INCLUDED.get(i)));
        }
        sb.append("],\"missing\":[");
        for (int i = 0; i < DropCopyCatalog.MISSING.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(Json.string(DropCopyCatalog.MISSING.get(i)));
        }
        sb.append("]}}");
        return sb.toString();
    }
}
