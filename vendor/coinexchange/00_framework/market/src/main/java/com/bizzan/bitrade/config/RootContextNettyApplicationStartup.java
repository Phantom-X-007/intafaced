package com.bizzan.bitrade.config;

import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.context.event.ContextRefreshedEvent;

import com.aqmd.netty.server.NettyApplicationStartup;

import lombok.extern.slf4j.Slf4j;

/**
 * Starts the vendored Hawk Netty servers exactly once, for the root application
 * context only.
 *
 * WHY THIS EXISTS
 *
 * com.aqmd.netty.server.NettyApplicationStartup (aqmd-netty 2.0.1, a binary-only
 * dependency in market/lib) is an ApplicationListener&lt;ContextRefreshedEvent&gt;
 * whose onApplicationEvent unconditionally does:
 *
 *     new Thread(new NettyServer(properties.getPort(), ...)).start();
 *     new Thread(new NettyServer(properties.getWebsocketPort(), ...)).start();
 *
 * with no guard on which context fired the event and no record that it has
 * already run. Spring publishes ContextRefreshedEvent to the refreshing context
 * AND propagates it up to every parent, and Spring Cloud Netflix Ribbon creates
 * a CHILD AnnotationConfigApplicationContext per Ribbon client - this service
 * has one for SERVICE-EXCHANGE-TRADE, created lazily by CoinProcessorJob on the
 * first call. When that child refreshes, the listener registered in the root
 * context fires a second time and tries to bind ports 28901 and 28985 again,
 * which the JVM answers with:
 *
 *     Exception in thread "Thread-15" java.net.BindException: Address already in use
 *         at io.netty.channel.socket.nio.NioServerSocketChannel.doBind(...)
 *
 * The exception is thrown on a bare Thread with no handler, so it kills that
 * thread silently and leaks a netty NioEventLoopGroup on every occurrence.
 *
 * The fix is to stop the duplicate start, not to catch the BindException: a
 * try/catch would still build and leak a second server per refresh. This
 * subclass ignores events from any context other than the one it was defined
 * in, and is idempotent besides. {@link NettyStartupGuard} swaps it in for the
 * vendored bean.
 */
@Slf4j
public class RootContextNettyApplicationStartup extends NettyApplicationStartup implements ApplicationContextAware {

    private final AtomicBoolean started = new AtomicBoolean(false);

    /** The context this bean is defined in - the root application context. */
    private ApplicationContext ownContext;

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) {
        this.ownContext = applicationContext;
    }

    @Override
    public void onApplicationEvent(ContextRefreshedEvent event) {
        ApplicationContext source = event.getApplicationContext();

        if (ownContext != null && source != ownContext) {
            // A child context (Ribbon, Feign, and friends each build their own).
            // Its refresh says nothing about whether our netty servers should
            // start, and acting on it is what caused the BindException.
            log.debug("Ignoring ContextRefreshedEvent from child context '{}'; the Hawk Netty servers belong to '{}'",
                    source.getDisplayName(), ownContext.getDisplayName());
            return;
        }

        if (!started.compareAndSet(false, true)) {
            log.warn("Hawk Netty servers are already running; ignoring a repeat ContextRefreshedEvent from '{}'",
                    source.getDisplayName());
            return;
        }

        log.info("Starting Hawk Netty servers for root context '{}'", source.getDisplayName());
        super.onApplicationEvent(event);
    }
}
