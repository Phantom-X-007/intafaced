package io.intafaced.fix;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Drop-copy source census. Included = sources that actually published.
 * Streamable = sources this process can stream (FIX order-entry only).
 * Do not synthesize UI/REST/WS/algo/liquidation/RFQ/broker executions.
 */
public final class DropCopyCatalog {
    public static final String FIX = "fix";
    public static final List<String> REQUIRED =
            List.of("ui", "rest", "ws", "fix", "algo", "liquidation", "rfq", "broker");
    public static final List<String> STREAMABLE = List.of(FIX);

    private DropCopyCatalog() {}

    public static boolean streamable(String source) {
        return source != null && STREAMABLE.contains(source);
    }

    public static List<String> includedOf(Collection<String> published) {
        Set<String> seen = published == null ? Set.of() : new LinkedHashSet<>(published);
        List<String> included = new ArrayList<>();
        for (String source : REQUIRED) {
            if (seen.contains(source) && STREAMABLE.contains(source)) {
                included.add(source);
            }
        }
        return List.copyOf(included);
    }

    public static List<String> missingOf(Collection<String> published) {
        Set<String> seen = published == null ? Set.of() : new LinkedHashSet<>(published);
        List<String> missing = new ArrayList<>();
        for (String source : REQUIRED) {
            if (!STREAMABLE.contains(source) || !seen.contains(source)) {
                missing.add(source);
            }
        }
        return List.copyOf(missing);
    }

    /** No sources have published. Completeness refuses. */
    public static DropCopyCompleteness claimComplete() {
        return claimComplete(List.of());
    }

    /**
     * Complete only when every required source has actually published.
     * Never mint completeness from the streamable list alone.
     */
    public static DropCopyCompleteness claimComplete(Collection<String> published) {
        List<String> included = includedOf(published);
        List<String> missing = missingOf(published);
        if (missing.isEmpty()
                && STREAMABLE.containsAll(REQUIRED)
                && included.size() == REQUIRED.size()) {
            return DropCopyCompleteness.complete(included);
        }
        return DropCopyCompleteness.incomplete(included, missing);
    }
}
