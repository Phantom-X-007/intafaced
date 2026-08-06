import Vue from 'vue';
import iView from 'iview';
import { router, initRouter } from './router/index';
import { appRouter } from './router/router';
import store from './store';
import App from './app.vue';
import '@/locale';
import 'iview/dist/styles/iview.css';
import VueI18n from 'vue-i18n';
import util from '@/libs/util';
import axios from 'axios';
import qs from 'qs';
import Api from '@/config/api';
import Cookies from 'js-cookie';
import Viser from 'viser-vue';
import { setStore, getStore, removeStore } from "@/config/storage.js";

Vue.prototype.$ajax = axios;
axios.defaults.withCredentials = true;

function toFloor(number, scale = 8) {
    if (new Number(number) == 0) { // "0.0000000000000000"
        return 0;
    }
    let str = number + "";
    if (str.indexOf('e') > -1 || str.indexOf('E') > -1) {
        let num = new Number(number).toFixed(scale + 1),
            str = num + "";
        return str.substring(0, str.length - 1);
    } else if (str.indexOf(".") > -1) {
        if (scale == 0) {
            return str.substring(0, str.indexOf("."));
        }
        return str.substring(0, str.indexOf(".") + scale + 1);
    } else {
        return str;
    }
}
Vue.filter('toFloor', (number, scale) => {
    return toFloor(number, scale);
});
Vue.prototype.toFloor = toFloor;
axios.interceptors.response.use((response) => {
    const data = response.data
    let baseURL = response.config.baseURL;
    let url = response.config.url;

    if (data.code === 4000) {
        Cookies.remove('user');
        Cookies.remove('userPhone');
        Cookies.remove('userInfo');
        router.push({ name: 'login' });
    }
    if (data.code === 5000) {
        router.push({ name: 'error-403' });
    }
    return response;
});

Date.prototype.Format = function(fmt){
    var o = {
        "M+": this.getMonth()+1,
        "d+": this.getDate(),
        "H+": this.getHours(),
        "m+": this.getMinutes(),
        "s+": this.getSeconds(),
        "S+": this.getMilliseconds()
    };
    // date.getFullYear()number,
    if(/(y+)/.test(fmt)){
        // “+”date.getFullYear()+""number
        fmt=fmt.replace(RegExp.$1,(this.getFullYear()+"").substr(4-RegExp.$1.length));
    }
    for(var k in o){
        if (new RegExp("(" + k +")").test(fmt)){
            // String()String(date.getFullYear())
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(String(o[k]).length)));
        }
    }
    return fmt;
};

// axios.interceptors.request.use((config) => {
//   config.headers['x-auth-token'] = Cookies.get('x-auth-token');
//   return config;
// })
Vue.prototype.numToFixed = util.numToFixed;

Vue.prototype.api = Api;
Vue.use(VueI18n);
Vue.use(iView);
Vue.use(Viser);

new Vue({
    el: '#app',
    router: router,
    store: store,
    render: h => h(App),
    data: {
        currentPageName: ''
    },
    mounted() {
        this.currentPageName = this.$route.name;
        this.$store.commit('setOpenedList');
        this.$store.commit('initCachepage');
        this.$store.commit('updateMenulist');
    },
    created() {
        let tagsList = [];
        appRouter.map((item) => {
            if (item.children.length <= 1) {
                tagsList.push(item.children[0]);
            } else {
                tagsList.push(...item.children);
            }
        });
        this.$store.commit('setTagsList', tagsList);
    }
});
