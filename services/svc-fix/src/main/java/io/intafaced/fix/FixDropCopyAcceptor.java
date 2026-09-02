package io.intafaced.fix;

import quickfix.DefaultMessageFactory;
import quickfix.MemoryStoreFactory;
import quickfix.ScreenLogFactory;
import quickfix.SessionSettings;
import quickfix.ThreadedSocketAcceptor;

/**
 * Named drop-copy QFJ 3.0.2 acceptor. Not the order-entry session. Not a ledger.
 */
public final class FixDropCopyAcceptor implements AutoCloseable {
    private final ThreadedSocketAcceptor acceptor;
    public final FixDropCopyApplication application;
    public final FixAcceptorConfig config;

    private FixDropCopyAcceptor(
            ThreadedSocketAcceptor acceptor, FixDropCopyApplication application, FixAcceptorConfig config) {
        this.acceptor = acceptor;
        this.application = application;
        this.config = config;
    }

    public static FixDropCopyAcceptor start(FixAcceptorConfig config, FixDropCopyApplication application)
            throws Exception {
        SessionSettings settings = config.toSessionSettings();
        ThreadedSocketAcceptor acceptor = new ThreadedSocketAcceptor(
                application,
                new MemoryStoreFactory(),
                settings,
                new ScreenLogFactory(false, false, false),
                new DefaultMessageFactory());
        acceptor.start();
        return new FixDropCopyAcceptor(acceptor, application, config);
    }

    @Override
    public void close() {
        acceptor.stop();
    }
}
