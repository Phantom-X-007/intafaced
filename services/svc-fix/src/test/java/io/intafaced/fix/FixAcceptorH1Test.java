package io.intafaced.fix;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.ServerSocket;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import quickfix.FixVersions;
import quickfix.SessionID;
import quickfix.field.ClOrdID;
import quickfix.field.MsgSeqNum;
import quickfix.field.MsgType;
import quickfix.field.OrdType;
import quickfix.field.OrderQty;
import quickfix.field.Price;
import quickfix.field.SenderCompID;
import quickfix.field.SendingTime;
import quickfix.field.Side;
import quickfix.field.Symbol;
import quickfix.field.TargetCompID;
import quickfix.field.TimeInForce;
import quickfix.field.TransactTime;
import quickfix.fix44.NewOrderSingle;

/**
 * H1: acceptor starts; unsupported BeginString refuses; unmapped CompID does not POST.
 * Matching HTTP is a named stub — not live matching.
 */
class FixAcceptorH1Test {
    private static final SessionID SESSION = new SessionID(FixVersions.BEGINSTRING_FIX44, "INTAFACED", "CLIENT");

    @Test
    @Timeout(20)
    void acceptorStartsUnsupportedBeginStringRefusesUnmappedCompIdDoesNotPost() throws Exception {
        SessionConfigResult unsupported = FixAcceptorConfig.fromOwner(
                FixVersions.BEGINSTRING_FIX40, "INTAFACED", "CLIENT", "19000", "5", "");
        assertFalse(unsupported.ok);
        assertEquals("unsupported_begin_string", unsupported.errorCode);

        AtomicInteger posts = new AtomicInteger(0);
        MatchingSubmitPort stubMatching = new MatchingSubmitPort(
                "http://matching.example",
                "",
                (url, json, headers) -> {
                    posts.incrementAndGet();
                    throw new AssertionError("named stub matching HTTP must not receive unmapped CompID");
                });

        int port = freePort();
        SessionConfigResult parsed = FixAcceptorConfig.fromOwner(
                FixVersions.BEGINSTRING_FIX44, "INTAFACED", "CLIENT", Integer.toString(port), "5", "");
        assertTrue(parsed.ok, parsed.errorMessage);
        FixSessionApplication app = new FixSessionApplication(new FixGatewayAdapter(), stubMatching);
        try (FixAcceptor acceptor = FixAcceptor.start(parsed.config, app)) {
            assertEquals(port, acceptor.config.socketAcceptPort);

            NewOrderSingle nos = new NewOrderSingle();
            nos.getHeader().setString(quickfix.field.BeginString.FIELD, FixVersions.BEGINSTRING_FIX44);
            nos.getHeader().setString(SenderCompID.FIELD, "CLIENT");
            nos.getHeader().setString(TargetCompID.FIELD, "INTAFACED");
            nos.getHeader().setInt(MsgSeqNum.FIELD, 2);
            nos.getHeader().setUtcTimeStamp(SendingTime.FIELD, LocalDateTime.of(2026, 9, 3, 12, 0, 0), true);
            nos.set(new ClOrdID("h1-unmapped"));
            nos.set(new Symbol("BTC/USDT"));
            nos.set(new Side(Side.BUY));
            nos.set(new TransactTime(LocalDateTime.of(2026, 9, 3, 12, 0, 0)));
            nos.set(new OrdType(OrdType.LIMIT));
            nos.setString(OrderQty.FIELD, "1.50");
            nos.setString(Price.FIELD, "100.25");
            nos.set(new TimeInForce(TimeInForce.GOOD_TILL_CANCEL));
            app.fromApp(nos, SESSION);

            assertEquals(0, posts.get());
            assertEquals(0, app.matchingPosts());
            assertEquals(1, app.outbound().size());
            assertEquals(MsgType.REJECT, app.outbound().get(0).getHeader().getString(MsgType.FIELD));
            assertEquals("matching_account_unmapped", matchingRefuseCode(stubMatching, nos));
        }
    }

    private static String matchingRefuseCode(MatchingSubmitPort port, NewOrderSingle nos) throws Exception {
        AdaptResult adapted = new FixGatewayAdapter().adapt(nos.toString());
        assertTrue(adapted.ok, adapted.errorMessage);
        MatchingSubmitResult posted = port.submit(adapted.command);
        assertFalse(posted.ok);
        assertFalse(posted.httpSent);
        return posted.errorCode;
    }

    private static int freePort() throws Exception {
        try (ServerSocket socket = new ServerSocket(0)) {
            socket.setReuseAddress(true);
            return socket.getLocalPort();
        }
    }
}
