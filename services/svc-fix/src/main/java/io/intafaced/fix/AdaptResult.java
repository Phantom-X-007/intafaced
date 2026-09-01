package io.intafaced.fix;

public final class AdaptResult {
    public final boolean ok;
    public final MatchingOrderCommand command;
    public final String errorCode;
    public final String errorMessage;

    private AdaptResult(boolean ok, MatchingOrderCommand command, String errorCode, String errorMessage) {
        this.ok = ok;
        this.command = command;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }

    public static AdaptResult command(MatchingOrderCommand command) {
        return new AdaptResult(true, command, null, null);
    }

    public static AdaptResult refuse(String code, String message) {
        return new AdaptResult(false, null, code, message);
    }

    public String toJson() {
        if (ok) {
            return "{\"ok\":true,\"command\":" + command.toJson() + "}";
        }
        return "{\"ok\":false,\"error\":{\"code\":"
                + Json.string(errorCode)
                + ",\"message\":"
                + Json.string(errorMessage)
                + "}}";
    }
}
