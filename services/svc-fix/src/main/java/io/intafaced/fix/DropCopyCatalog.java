package io.intafaced.fix;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Drop-copy source census. Included = sources that actually published.
 * Streamable = FIX matching acks plus ingest-hitchable house-book sources.
 * ui is FRONTEND and is not streamable — publishing it still refuses.
 * Completeness stays refuse until every REQUIRED source is streamable and has published.
 */
public final class DropCopyCatalog {
    public static final String UI = "ui";
    public static final String REST = "rest";
    public static final String WS = "ws";
    public static final String FIX = "fix";
    public static final String ALGO = "algo";
    public static final String LIQUIDATION = "liquidation";
    public static final String RFQ = "rfq";
    public static final String BROKER = "broker";
    public static final List<String> REQUIRED =
            List.of(UI, REST, WS, FIX, ALGO, LIQUIDATION, RFQ, BROKER);
    /** Ingest is the live door for every name except ui. */
    public static final List<String> STREAMABLE =
            List.of(REST, WS, FIX, ALGO, LIQUIDATION, RFQ, BROKER);

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
