package io.intafaced.fix;

public final class DropCopyPublishResult {
    public final boolean ok;
    public final int delivered;
    public final String errorCode;
    public final String errorMessage;

    private DropCopyPublishResult(boolean ok, int delivered, String errorCode, String errorMessage) {
        this.ok = ok;
        this.delivered = delivered;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }

    public static DropCopyPublishResult streamed(int delivered) {
        return new DropCopyPublishResult(true, delivered, null, null);
    }

    public static DropCopyPublishResult refuse(String code, String message) {
        return new DropCopyPublishResult(false, 0, code, message);
    }
}
