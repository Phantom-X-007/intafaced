package io.intafaced.fix;

import java.util.Map;

/**
 * Live QFJ acceptor. OWNER-SET env. Blank sockets refuse.
 * Drop-copy is a second session when FIX_DROPCOPY_* is set. Not order-entry.
 * stdin adapt CLI remains FixAdapterMain.
 */
public final class FixAcceptorMain {
    public static void main(String[] args) throws Exception {
        Map<String, String> env = System.getenv();
        SessionConfigResult parsed = FixAcceptorConfig.fromOwnerEnv(env);
        if (!parsed.ok) {
            System.err.print(parsed.errorCode + ": " + parsed.errorMessage);
            System.exit(2);
            return;
        }
        MatchingSubmitPort matching = MatchingSubmitPort.fromEnv(env);
        if (!FixDropCopyConfig.requested(env)) {
            FixSessionApplication orderApp = new FixSessionApplication(new FixGatewayAdapter(), matching);
            try (FixAcceptor ignored = FixAcceptor.start(parsed.config, orderApp)) {
                Thread.currentThread().join();
            }
            return;
        }
        SessionConfigResult dropCopy = FixDropCopyConfig.fromOwnerEnv(env);
        if (!dropCopy.ok) {
            System.err.print(dropCopy.errorCode + ": " + dropCopy.errorMessage);
            System.exit(2);
            return;
        }
        SessionConfigResult independent = FixDropCopyConfig.independentOf(parsed.config, dropCopy.config);
        if (!independent.ok) {
            System.err.print(independent.errorCode + ": " + independent.errorMessage);
            System.exit(2);
            return;
        }
        DropCopyHub hub = new DropCopyHub();
        FixSessionApplication orderApp = new FixSessionApplication(new FixGatewayAdapter(), matching, hub);
        FixDropCopyApplication dropApp = new FixDropCopyApplication(hub);
        try (FixAcceptor ignored = FixAcceptor.start(parsed.config, orderApp);
                FixDropCopyAcceptor dropIgnored = FixDropCopyAcceptor.start(dropCopy.config, dropApp)) {
            Thread.currentThread().join();
        }
    }
}
