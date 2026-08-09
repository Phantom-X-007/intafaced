/**
 * Shared plumbing for the INTAFACED module screens.
 *
 * Every screen holds one or more "sections", and a section is always exactly
 * one of four things: loading, answered with data, answered empty, or refused
 * with a named reason. Keeping that shape in one place is what stops a screen
 * from quietly falling back to a blank table when the real answer was 403 —
 * the failure has nowhere to hide, because `reason` is a required part of the
 * section and `IxState` renders it.
 */
import ixTrade from '../../assets/js/ix-trade.js';

export default {
    computed: {
        /** The platform session's access token, or null. In memory only (config/store.js). */
        ixToken() {
            return this.$store.getters.ixToken;
        }
    },
    methods: {
        /** The initial state of a section: in flight, nothing known yet. */
        emptySection() {
            return { loading: true, reason: null, message: '', data: null };
        },

        /**
         * Resolve a section from a client call.
         *
         * The client resolves rather than rejects, so there is no catch here on
         * purpose — a refusal is data about the system, not an exception.
         *
         * Optional third arg: a wire schema (or `{ schema }`). When transport
         * is ok but the body fails shape (e.g. custodial:true on a sovereignty
         * health), the section is `invalid_response` and data is not painted.
         */
        load(key, promise, schemaOrOpts) {
            var self = this;
            var schema = null;
            if (schemaOrOpts && typeof schemaOrOpts === 'object' && schemaOrOpts.schema) {
                schema = schemaOrOpts.schema;
            } else if (schemaOrOpts) {
                schema = schemaOrOpts;
            }
            this[key] = { loading: true, reason: null, message: '', data: null };
            return promise.then(function(res) {
                if (!res.ok) {
                    self[key] = {
                        loading: false,
                        reason: res.reason,
                        message: res.message,
                        data: null
                    };
                    return res;
                }
                if (schema) {
                    var gate = ixTrade.accept(schema, res.data);
                    if (!gate.ok) {
                        self[key] = {
                            loading: false,
                            reason: gate.reason || 'invalid_response',
                            message: gate.message || '',
                            data: null
                        };
                        return res;
                    }
                    self[key] = {
                        loading: false,
                        reason: 'ok',
                        message: '',
                        data: gate.data
                    };
                    return res;
                }
                self[key] = {
                    loading: false,
                    reason: 'ok',
                    message: '',
                    data: res.data
                };
                return res;
            });
        },

        /**
         * The initial state of an ACTION — a mutation the reader triggers.
         *
         * Deliberately a different shape from a section. A section starts
         * `loading: true` because the screen asked for it on mount; an action
         * starts `ran: false` because nobody has asked for anything, and a form
         * that renders a refusal before it has been submitted would be lying
         * about a call that was never made.
         */
        emptyAction() {
            return { busy: false, ran: false, reason: null, message: '', data: null };
        },

        /**
         * Resolve an action from a client mutation.
         *
         * Same contract as `load`: the client resolves rather than rejects, so a
         * refusal lands in `reason` and the form quotes the service verbatim
         * instead of a generic failure toast that hides which system said no.
         */
        act(key, promise) {
            var self = this;
            this[key] = { busy: true, ran: true, reason: null, message: '', data: null };
            return promise.then(function(res) {
                self[key] = {
                    busy: false,
                    ran: true,
                    reason: res.ok ? 'ok' : res.reason,
                    message: res.ok ? '' : res.message,
                    data: res.ok ? res.data : null
                };
                return res;
            });
        },

        /**
         * A client-supplied id that survives a retry (§5 — idempotency keys).
         *
         * Several svc-bank writes take the id of the thing being created from
         * the CLIENT, precisely so a timed-out request that the user presses
         * again is the same transfer / loan / card and not a second one. That
         * only works if the browser holds the id still across those retries, so
         * it is minted ONCE per draft and released with `clearDraftId` after the
         * service has accepted it. Minting a fresh one per click would turn the
         * service's idempotency guarantee into decoration.
         */
        draftId(name) {
            if (!this.ixDrafts) this.ixDrafts = {};
            if (!this.ixDrafts[name]) this.ixDrafts[name] = newUuid();
            return this.ixDrafts[name];
        },

        clearDraftId(name) {
            if (this.ixDrafts) delete this.ixDrafts[name];
        }
    }
};

/**
 * A v4 uuid, from the platform CSPRNG.
 *
 * `crypto.randomUUID` is not in every browser this shell still supports, and
 * the fallback uses `getRandomValues` rather than `Math.random` — these ids
 * become the business key of a money write, and a predictable one would let a
 * third party collide with somebody else's in-flight transfer.
 */
function newUuid() {
    var c = typeof window !== 'undefined' ? window.crypto : null;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    if (c && typeof c.getRandomValues === 'function') {
        var b = new Uint8Array(16);
        c.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        var hex = [];
        for (var i = 0; i < 16; i++) hex.push((b[i] + 0x100).toString(16).slice(1));
        return (
            hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' + hex.slice(6, 8).join('') + '-' +
            hex.slice(8, 10).join('') + '-' + hex.slice(10, 16).join('')
        );
    }
    // No CSPRNG at all. Returning a weak id would be worse than refusing: the
    // caller renders the refusal rather than posting a guessable business key.
    return '';
}
