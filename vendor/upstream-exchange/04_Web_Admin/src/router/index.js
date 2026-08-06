import Vue from 'vue';
import iView from 'iview';
import Util from '../libs/util';
import VueRouter from 'vue-router';
import Cookies from 'js-cookie';
import { routers, otherRouter, appRouter } from './router';

Vue.use(VueRouter);

const RouterConfig = {
    mode: 'hash',
    routes: routers
};

export const router = new VueRouter(RouterConfig);

router.beforeEach((to, from, next) => {
    iView.LoadingBar.start();
    Util.title(to.meta.title);

    if (Cookies.get('locking') === '1' && to.name !== 'locking') {
        next({
            replace: true,
            name: 'locking'
        });
    } else if (Cookies.get('locking') === '0' && to.name === 'locking') {
        next(false);
    } else {
        if (!Cookies.get('user') && to.name !== 'login') {
            next({
                name: 'login'
            });
        } else if (Cookies.get('user') && to.name === 'login') {
            Util.title();
            next({
                name: 'home_index'
            });
        } else {
            const curRouterObj = Util.getRouterObjByName([otherRouter, ...appRouter], to.name);

            if (curRouterObj && curRouterObj.access !== undefined) {
                if (curRouterObj.access === 1) {
                    Util.toDefaultPage([otherRouter, ...appRouter], to.name, router, next);
                } else {
                    // removeStore("leftSidebarList");
                    // Cookies.remove('userInfo');
                    // Cookies.remove('userPhone');
                    // removeStore("pageOpenedList");
                    // this.$store.commit("logout", this);
                    // this.$store.commit("clearOpenedSubmenu");
                    // this.$store.commit('clearAllTags');
                    // clearAppRouter();
                    // this.$router.push({
                    //   name: "login"
                    // });

                    // this.$Message.warning(' ');
                    // next();

                    next({
                        replace: true,
                        name: 'error-403'
                    });
                }
            } else { // ,
                Util.toDefaultPage([...routers], to.name, router, next);
            }
        }
    }
});

router.afterEach((to) => {
    Util.openNewPage(router.app, to.name, to.params, to.query);
    iView.LoadingBar.finish();
    window.scrollTo(0, 0);
});
