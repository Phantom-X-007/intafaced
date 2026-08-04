import Cookies from 'js-cookie';

const user = {
  state: {
    pageLoading: false,
    memberCheckMask: false,
    memberCheckImgInfo: {},
    date: '',
    businessCheckMask: false,
    businessCheckInfo: {},
  },
  mutations: {
    logout(state, vm) {
      Cookies.remove('user');
      Cookies.remove('password');
      Cookies.remove('access');
      let themeLink = document.querySelector('link[name="theme"]');
      themeLink.setAttribute('href', '');
      let theme = '';
      if (localStorage.theme) {
        theme = localStorage.theme;
      }
      localStorage.clear();
      if (theme) {
        localStorage.theme = theme;
      }
    },
    switchBusinessMask(state, bol) {
      state.businessCheckMask = bol;
    },
    switchLoading(state, bol) {
      state.pageLoading = bol;
    },
    switchMemberMask(state, bol) {
      state.memberCheckMask = bol;
    },
    businessCheckInfo(state, obj) {
      state.businessCheckInfo = obj;
    },
    memeberCheckImg(state, obj) {
      state.memberCheckImgInfo = obj;
    },
    changeDate(state, str) {
      state.date = str;
    }
  }
};

export default user;