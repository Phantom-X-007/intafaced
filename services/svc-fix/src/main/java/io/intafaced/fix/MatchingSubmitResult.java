package io.intafaced.fix;

public final class MatchingSubmitResult {
    public final boolean ok;
    public final boolean httpSent;
    public final MatchingAck ack;
    public final String errorCode;
    public final String errorMessage;

    private MatchingSubmitResult(
            boolean ok, boolean httpSent, MatchingAck ack, String errorCode, String errorMessage) {
        this.ok = ok;
        this.httpSent = httpSent;
        this.ack = ack;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }

    public static MatchingSubmitResult accepted(MatchingAck ack, boolean httpSent) {
        return new MatchingSubmitResult(true, httpSent, ack, null, null);
    }

    public static MatchingSubmitResult refuse(String code, String message, boolean httpSent) {
        return new MatchingSubmitResult(false, httpSent, null, code, message);
    }
}
