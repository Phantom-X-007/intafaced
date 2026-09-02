package io.intafaced.fix;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import quickfix.FixVersions;

class MatchingSubmitPortTest {
    private static final String OWNER_MAP = "{\"CLIENT\":\"acct-desk\"}";

    private final MatchingOrderCommand limit = new MatchingOrderCommand(
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            FixVersions.BEGINSTRING_FIX44,
            null,
            "BTC/USDT",
            "buy",
            "limit",
            "1.50",
            "100.25",
            "CLIENT",
            "GTC");

    @Test
    void unmappedCompIdRefusesBeforePost() {
        AtomicReference<String> posted = new AtomicReference<>();
        MatchingSubmitPort port = new MatchingSubmitPort(
                "http://matching.example", OWNER_MAP, (url, json) -> {
                    posted.set(json);
                    return new MatchingSubmitPort.Transport.Response(200, "{\"accepted\":true,\"sequence\":1}");
                });
        MatchingOrderCommand ghost = new MatchingOrderCommand(
                limit.clOrdId, limit.beginString, null, limit.symbol, limit.side, limit.ordType, limit.qty, limit.price, "GHOST", "GTC");
        MatchingSubmitResult result = port.submit(ghost);
        assertFalse(result.ok);
        assertFalse(result.httpSent);
        assertEquals("matching_account_unmapped", result.errorCode);
        assertNull(posted.get());
    }

    @Test
    void missingTifRefusesBeforePost() {
        MatchingSubmitPort port = new MatchingSubmitPort("http://matching.example", OWNER_MAP, (url, json) -> {
            throw new AssertionError("must not POST");
        });
        MatchingOrderCommand missing = new MatchingOrderCommand(
                limit.clOrdId, limit.beginString, null, limit.symbol, limit.side, limit.ordType, limit.qty, limit.price, "CLIENT", null);
        MatchingSubmitResult result = port.submit(missing);
        assertFalse(result.ok);
        assertFalse(result.httpSent);
        assertEquals("tif_missing", result.errorCode);
    }

    @Test
    void blankMatchingUrlRefusesWithoutInventingHost() {
        MatchingSubmitPort port = new MatchingSubmitPort("", OWNER_MAP, (url, json) -> {
            throw new AssertionError("must not POST");
        });
        MatchingSubmitResult result = port.submit(limit);
        assertFalse(result.ok);
        assertEquals("matching_unconfigured", result.errorCode);
        assertTrue(result.errorMessage.contains("invent"));
        assertFalse(result.errorMessage.toLowerCase().contains("localhost"));
    }

    @Test
    void mappedCompIdPostsDecimalStringsAndKeepsMatchingSequence() {
        AtomicReference<String> url = new AtomicReference<>();
        AtomicReference<String> json = new AtomicReference<>();
        MatchingSubmitPort port = new MatchingSubmitPort("http://matching.example/", OWNER_MAP, (postedUrl, body) -> {
            url.set(postedUrl);
            json.set(body);
            return new MatchingSubmitPort.Transport.Response(
                    200,
                    "{\"accepted\":true,\"sequence\":7,\"fills\":[{\"price\":99.5,\"qty\":1.5}],\"last\":99.5,\"account\":\"ghost\"}");
        });
        MatchingSubmitResult result = port.submit(limit);
        assertTrue(result.ok, result.errorMessage);
        assertTrue(result.httpSent);
        assertEquals(7L, result.ack.sequence);
        assertTrue(url.get().endsWith("/markets/BTC%2FUSDT/orders"));
        assertTrue(json.get().contains("\"qty\":\"1.50\""));
        assertTrue(json.get().contains("\"price\":\"100.25\""));
        assertTrue(json.get().contains("\"accountId\":\"acct-desk\""));
        assertTrue(json.get().contains("\"tif\":\"GTC\""));
        assertFalse(json.get().contains("lastPrice"));
        assertFalse(json.get().contains("99.5"));
        assertFalse(json.get().contains("ledger"));
    }

    @Test
    void ieeeSequenceIsNotTreatedAsMoney() {
        MatchingSubmitPort port = new MatchingSubmitPort("http://matching.example", OWNER_MAP, (u, b) ->
                new MatchingSubmitPort.Transport.Response(200, "{\"accepted\":true,\"sequence\":1.5,\"last\":100.25}"));
        MatchingSubmitResult result = port.submit(limit);
        assertFalse(result.ok);
        assertEquals("matching_rejected", result.errorCode);
    }

    @Test
    void noLedgerClientOnThePort() {
        assertFalse(MatchingSubmitPort.class.getName().contains("ledger"));
        assertFalse(ExecutionReportFactory.class.getName().contains("ledger"));
    }
}
