package io.intafaced.fix;

/**
 * Live QFJ acceptor. OWNER-SET env. Blank sockets refuse.
 * stdin adapt CLI remains FixAdapterMain. Not C2 NOS.
 */
public final class FixAcceptorMain {
    public static void main(String[] args) throws Exception {
        SessionConfigResult parsed = FixAcceptorConfig.fromOwnerEnv(System.getenv());
        if (!parsed.ok) {
            System.err.print(parsed.errorCode + ": " + parsed.errorMessage);
            System.exit(2);
            return;
        }
        try (FixAcceptor ignored = FixAcceptor.start(parsed.config, new FixSessionApplication())) {
            Thread.currentThread().join();
        }
    }
}
