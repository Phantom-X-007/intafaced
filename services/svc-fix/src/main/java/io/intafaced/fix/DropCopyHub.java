package io.intafaced.fix;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import quickfix.Message;

/**
 * In-process fanout from included sources to the drop-copy session.
 * Missing sources refuse. No invented executions. No ledger.
 */
public final class DropCopyHub {
    private final List<FixDropCopyApplication> listeners = new CopyOnWriteArrayList<>();

    public void attach(FixDropCopyApplication listener) {
        if (listener != null) {
            listeners.add(listener);
        }
    }

    public DropCopyPublishResult publish(String source, Message execution) {
        if (execution == null) {
            return DropCopyPublishResult.refuse(
                    "dropcopy_source_missing", "execution is missing; svc-fix does not synthesize a drop-copy fill");
        }
        if (!DropCopyCatalog.included(source)) {
            String name = source == null || source.isBlank() ? "unknown" : source;
            return DropCopyPublishResult.refuse(
                    "dropcopy_source_missing",
                    "source "
                            + name
                            + " is not included; included=["
                            + String.join(",", DropCopyCatalog.INCLUDED)
                            + "]; missing=["
                            + String.join(",", DropCopyCatalog.MISSING)
                            + "]; svc-fix does not synthesize missing sources");
        }
        int delivered = 0;
        for (FixDropCopyApplication listener : listeners) {
            listener.deliver(execution);
            delivered++;
        }
        return DropCopyPublishResult.streamed(delivered);
    }

    public static DropCopyHub disabled() {
        return new DropCopyHub();
    }
}
