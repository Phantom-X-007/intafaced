import Vue from 'vue';
import Vuex from 'vuex';
Vue.use(Vuex);

/** The one supported language. Components compare `state.lang` against this. */
export const LANGUAGE = 'English';

export default new Vuex.Store({
    state: {
        member: null,
        activeNav: '',
        lang: LANGUAGE,
        exchangeSkin:'night',
        loginTimes: null,
        /** svc-identity session — memory only, see setIxSession. */
        ixSession: null,
        /**
         * Selected identity sub-account id for the desk selector (A-UI-SUB).
         * null = parent. Memory only — never localStorage; not a balance owner
         * claim. Trade routing under a sub is NOT wired (TRADE_ROUTING_READY).
         */
        ixSubAccountId: null
    },
    mutations: {
        navigate(state, nav) {
            state.activeNav = nav;
        },
        /**
         * The signed-in user as the shell's chrome and screens read it.
         *
         * NO LONGER PERSISTED, and that is the whole point. `member` used to be
         * the vendored exchange's ucenter login, written to localStorage and
         * read back by `recoveryMember` on every boot. Authentication now runs
         * against svc-identity (pages/uc/Login.vue), whose session is held in
         * memory only — see setIxSession below for why.
         *
         * Persisting `member` beside a memory-only bearer would manufacture the
         * one state that must never exist: `isLogin === true` with no token
         * behind it, after a reload, across the ~25 screens that branch on it.
         * Each would call a scoped procedure as an anonymous caller and render
         * the refusal as though the reader had done something wrong.
         *
         * A memory-only member and a memory-only session cannot disagree.
         */
        setMember(state, member) {
            state.member = member;
        },
        /**
         * Boot-time recovery — which now deliberately recovers nothing.
         *
         * Kept as a mutation because App.vue commits it on every boot. It clears
         * the vendored keys instead of restoring them, so a `MEMBER` or `TOKEN`
         * left behind by an older build of this shell, or by the dead Java
         * ucenter login, cannot present itself as a live session.
         */
        recoveryMember(state) {
            state.member = null;
            try {
                localStorage.removeItem('MEMBER');
                localStorage.removeItem('TOKEN');
            } catch (e) {
                // A private-mode storage refusal is not a reason to fail boot.
            }
        },
        // English only. Both mutations are hard-wired: components across the app
        // branch on `state.lang`, and a stored preference from an earlier build
        // would otherwise put those branches back into Chinese.
        setlang(state) {
            state.lang = LANGUAGE;
            localStorage.setItem('LANGUAGE', JSON.stringify(LANGUAGE));
        },
        initLang(state) {
            state.lang = LANGUAGE;
            localStorage.setItem('LANGUAGE', JSON.stringify(LANGUAGE));
        },
        initLoginTimes(state){
            if(localStorage.getItem("LOGINTIMES") == null){
                state.loginTimes = 0;
            }else{
                state.loginTimes = JSON.parse(localStorage.getItem('LOGINTIMES'));
            }
        },
        setLoginTimes(state, times){
            state.loginTimes = times;
            localStorage.setItem('LOGINTIMES', JSON.stringify(times));
        },
        setSkin(state,skin){
            state.exchangeSkin=skin;
        },
        /**
         * The INTAFACED platform session (svc-identity), held in memory only.
         *
         * Deliberately NOT localStorage. apps/web already states the same limit
         * out loud — an httpOnly refresh cookie is the fix and it is not built —
         * and a second surface writing a bearer token to disk would spread the
         * exposure before the fix lands rather than after. A reload signs the
         * platform session out; the screens say so.
         *
         * This WAS a separate session from `member`, the vendored exchange's own
         * ucenter login. It is not any more: `member` is now a projection of
         * this session (see setMember), so the shell has exactly one notion of
         * who is signed in, and it is the svc-identity one.
         */
        setIxSession(state, session) {
            state.ixSession = session;
            // Always reset selection on session change — never inherit another principal's pick.
            state.ixSubAccountId = null;
        },
        clearIxSession(state) {
            state.ixSession = null;
            state.ixSubAccountId = null;
            state.member = null;
        },
        /** @param {string|null} id identity sub-account uuid, or null for parent */
        setIxSubAccountId(state, id) {
            state.ixSubAccountId = id == null || id === '' ? null : String(id);
        }
    },
    getters: {
        member(state) {
            return state.member;
        },
        /**
         * Signed in means: we hold a live svc-identity access token.
         *
         * It used to mean "a `member` object exists", which after the change to
         * setMember/recoveryMember would have been true for a stale localStorage
         * blob with no bearer behind it. Deriving it from the session instead
         * makes the check fail closed — a reload signs you out, which is the
         * truth while the platform session is memory-only.
         */
        isLogin(state) {
            return state.ixSession != null;
        },
        lang(state) {
            return state.lang;
        },
        loginTimes(state) {
            return state.loginTimes;
        },
        ixSession(state) {
            return state.ixSession;
        },
        ixToken(state) {
            return state.ixSession ? state.ixSession.accessToken : null;
        },
        ixSubAccountId(state) {
            return state.ixSubAccountId;
        }
    }
});
