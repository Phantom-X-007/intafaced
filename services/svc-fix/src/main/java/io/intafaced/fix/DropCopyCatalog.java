package io.intafaced.fix;

import java.util.List;

/**
 * Drop-copy source census. Only sources this process actually streams are included.
 * Do not synthesize UI/REST/WS/algo/liquidation/RFQ/broker executions.
 */
public final class DropCopyCatalog {
    public static final String FIX = "fix";
    public static final List<String> REQUIRED =
            List.of("ui", "rest", "ws", "fix", "algo", "liquidation", "rfq", "broker");
    public static final List<String> INCLUDED = List.of(FIX);
    public static final List<String> MISSING =
            List.of("ui", "rest", "ws", "algo", "liquidation", "rfq", "broker");

    private DropCopyCatalog() {}

    public static boolean included(String source) {
        return source != null && INCLUDED.contains(source);
    }

    public static DropCopyCompleteness claimComplete() {
        return DropCopyCompleteness.incomplete();
    }
}
