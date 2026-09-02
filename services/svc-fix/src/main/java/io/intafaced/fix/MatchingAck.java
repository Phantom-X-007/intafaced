package io.intafaced.fix;

/**
 * Named matching ack only. sequence is matching's. Extras (fills/last/account) are not minted here.
 */
public final class MatchingAck {
    public final boolean accepted;
    public final Long sequence;

    public MatchingAck(boolean accepted, Long sequence) {
        this.accepted = accepted;
        this.sequence = sequence;
    }
}
