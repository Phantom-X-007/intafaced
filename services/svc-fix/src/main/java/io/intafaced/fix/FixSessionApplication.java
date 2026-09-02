package io.intafaced.fix;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import quickfix.ApplicationAdapter;
import quickfix.FieldNotFound;
import quickfix.Message;
import quickfix.SessionID;
import quickfix.field.MsgType;

/**
 * Live FIX session application. Logon/heartbeat/resend/logout stay with QFJ.
 * C1 does not post matching and does not invent a fill. That is C2.
 */
public final class FixSessionApplication extends ApplicationAdapter {
    public final CountDownLatch loggedOn = new CountDownLatch(1);
    public final CountDownLatch loggedOut = new CountDownLatch(1);
    private final AtomicInteger matchingPosts = new AtomicInteger(0);
    private final List<String> adminMsgTypes = new ArrayList<>();
    private final List<String> appMsgTypes = new ArrayList<>();

    @Override
    public void onLogon(SessionID sessionId) {
        loggedOn.countDown();
    }

    @Override
    public void onLogout(SessionID sessionId) {
        loggedOut.countDown();
    }

    @Override
    public void fromAdmin(Message message, SessionID sessionId) throws FieldNotFound {
        record(adminMsgTypes, message);
    }

    @Override
    public void toAdmin(Message message, SessionID sessionId) {
        try {
            record(adminMsgTypes, message);
        } catch (FieldNotFound ignored) {
            // QFJ still sends the admin message.
        }
    }

    @Override
    public void fromApp(Message message, SessionID sessionId) throws FieldNotFound {
        record(appMsgTypes, message);
        // Not C2. Do not POST matching. Do not invent ExecutionReport/fills/last.
    }

    public int matchingPosts() {
        return matchingPosts.get();
    }

    public synchronized List<String> adminMsgTypes() {
        return List.copyOf(adminMsgTypes);
    }

    public synchronized List<String> appMsgTypes() {
        return List.copyOf(appMsgTypes);
    }

    private synchronized void record(List<String> into, Message message) throws FieldNotFound {
        into.add(message.getHeader().getString(MsgType.FIELD));
    }
}
