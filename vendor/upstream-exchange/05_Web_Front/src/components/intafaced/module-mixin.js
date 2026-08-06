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
         */
        load(key, promise) {
            var self = this;
            this[key] = { loading: true, reason: null, message: '', data: null };
            return promise.then(function(res) {
                self[key] = {
                    loading: false,
                    reason: res.ok ? 'ok' : res.reason,
                    message: res.ok ? '' : res.message,
                    data: res.ok ? res.data : null
                };
                return res;
            });
        }
    }
};
