package io.intafaced.fix;

public final class SessionConfigResult {
    public final boolean ok;
    public final FixAcceptorConfig config;
    public final String errorCode;
    public final String errorMessage;

    private SessionConfigResult(boolean ok, FixAcceptorConfig config, String errorCode, String errorMessage) {
        this.ok = ok;
        this.config = config;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }

    public static SessionConfigResult accept(FixAcceptorConfig config) {
        return new SessionConfigResult(true, config, null, null);
    }

    public static SessionConfigResult refuse(String code, String message) {
        return new SessionConfigResult(false, null, code, message);
    }
}
