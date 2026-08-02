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
        setMember(state, member) {
            state.member = member;
            localStorage.setItem('MEMBER', JSON.stringify(member));
        },
        recoveryMember(state) {
            state.member = JSON.parse(localStorage.getItem('MEMBER'));
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
         * This is a SEPARATE session from `member`, which is the vendored
         * exchange's own ucenter login. One account is the goal; this is not it
         * yet, and no screen pretends otherwise.
         */
        setIxSession(state, session) {
            state.ixSession = session;
            // Always reset selection on session change — never inherit another principal's pick.
            state.ixSubAccountId = null;
        },
        clearIxSession(state) {
            state.ixSession = null;
            state.ixSubAccountId = null;
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
        isLogin(state) {
            return state.member!= null;
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
