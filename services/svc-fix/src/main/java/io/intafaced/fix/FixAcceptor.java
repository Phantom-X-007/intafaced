package io.intafaced.fix;

import quickfix.DefaultMessageFactory;
import quickfix.MemoryStoreFactory;
import quickfix.ScreenLogFactory;
import quickfix.SessionSettings;
import quickfix.ThreadedSocketAcceptor;

/**
 * QuickFIX/J 3.0.2 acceptor. Session only. Not a book. Not a ledger.
 */
public final class FixAcceptor implements AutoCloseable {
    private final ThreadedSocketAcceptor acceptor;
    public final FixSessionApplication application;
    public final FixAcceptorConfig config;

    private FixAcceptor(ThreadedSocketAcceptor acceptor, FixSessionApplication application, FixAcceptorConfig config) {
        this.acceptor = acceptor;
        this.application = application;
        this.config = config;
    }

    public static FixAcceptor start(FixAcceptorConfig config, FixSessionApplication application) throws Exception {
        SessionSettings settings = config.toSessionSettings();
        ThreadedSocketAcceptor acceptor = new ThreadedSocketAcceptor(
                application,
                new MemoryStoreFactory(),
                settings,
                new ScreenLogFactory(false, false, false),
                new DefaultMessageFactory());
        acceptor.start();
        return new FixAcceptor(acceptor, application, config);
    }

    @Override
    public void close() {
        acceptor.stop();
    }
}
