<template>
  <div class="content-wraps">
    <div class="containers" id="List">
      <div class="fiat">
        <div class="to_business">
          <h3>{{$t('otc.main.title')}}</h3>
          <span>{{$t('otc.main.subtitle')}}</span>
          <a href="javascript:void(0)" @click="goBusiness">{{$t('otc.main.becomemerchant')}}</a>
          <!-- <router-link to="/identbusiness">Become a merchant</router-link> -->
        </div>
      </div>
      <div class="content">
        <Menu ref="navMenu" mode="horizontal" width="auto" :active-name="activeMenuName" @on-select="menuSelected" class='tradelist'>
          <MenuGroup>
            <template v-for="(coin,index) in coins">
              <MenuItem :name="'coin-'+index"> {{coin.unit}}
              </MenuItem>
            </template>
          </MenuGroup>
        </Menu>
        <router-view></router-view>
      </div>
      <div class="advantage">
        <ul>
          <li>
            <div class="image"><img src="../../assets/images/price.png" alt=""></div>
            <div class="title">{{$t('otc.main.adv1')}}</div>
            <div class="content1">{{$t('otc.main.adv1tip')}}</div>
          </li>
          <li>
            <div class="image"><img src="../../assets/images/poundage.png" alt=""></div>
            <div class="title">{{$t('otc.main.adv2')}}</div>
            <div class="content1">{{$t('otc.main.adv2tip')}}</div>
            <li>
              <div class="image"><img src="../../assets/images/instant.png" alt=""></div>
              <div class="title">{{$t('otc.main.adv3')}}</div>
              <div class="content1">{{$t('otc.main.adv3tip')}}</div>
            </li>
            <li>
              <div class="image"><img src="../../assets/images/platedanbao.png" alt=""></div>
              <div class="title">{{$t('otc.main.adv4')}}</div>
              <div class="content1">{{$t('otc.main.adv4tip')}}</div>
            </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.content-wraps {
  padding: 0 12%;
  // background-color: #fff;
  padding-top: 60px;
.containers {
    width: 100%;
    margin: 20px 0;
.fiat {
      border-radius: 5px;
      height: 250px;
      background: url("../../assets/images/otc_bg.jpg") no-repeat center center;
      background-size: 100%;
      display: flex; //flexlayout
      justify-content: center; //centre children horizontally
      align-items: center; //centre children vertically
.to_business {
        color: #fff;
        text-align: center;
        h3 {
          font-size: 46px;
          letter-spacing: 20px;
        }
        span {
          font-size: 20px;
          letter-spacing: 10px;
          display: block;
        }
        a {
          width: 220px;
          height: 45px;
          display: inline-block;
          background: #d0b387;
          border-radius: 5px;
          font-size: 20px;
          line-height: 45px;
          color: #000;
          margin-top: 20px;
        }
      }
    }
.content {
      width: 100%;
      margin: 20px auto;
      background-color: #000000;
      border-radius: 4px;
    }
.advantage {
      background-color: #000000;
      border-radius: 4px;
      ul {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 30px;
        li {
          width: 25%;
          list-style-type: none;
          min-height: 190px;
          div {
            text-align: center;
          }
          div.image {
            width: 50px;
            height: 50px;
            margin: 20px auto;
            img {
              width: 80%;
              // height: 80%;
              vertical-align: middle;
            }
          }
          div.title {
            line-height: 30px;
            font-size: 16px;
            color: #fff;
          }
          div.content1 {
            padding: 20px 40px;
            line-height: 20px;
            font-size: 12px;
            color: #999;
          }
        }
      }
    }
  }
}
</style>
<style lang="scss">
.content-wraps {
.containers {
.content {
      ul.tradelist.ivu-menu.ivu-menu-light.ivu-menu-horizontal {
        background-color: #000000;
        border-radius: 4px;
        &:after {
          background: none;
        }
.ivu-menu-item-group {
          li.ivu-menu-item {
            border: none;
            &:hover {
              color: #ff8534;
              border-bottom: 0;
            }
          }
          li.ivu-menu-item.ivu-menu-item-active.ivu-menu-item-selected {
            color: #ff8534;
            border-bottom: none;
          }
        }
      }
.nav-right.tradeCenter.list-content.ivu-tabs.ivu-tabs-tabpane {
.ivu-table-wrapper {
.ivu-spin.ivu-spin-large.ivu-spin-fix {
            border-color: #fff;
          }
        }
      }
    }
  }
}
</style>
<script>
export default {
  data() {
    return {
      coins: [],
      activeMenuName: "coin-1"
    };
  },
  computed: {
    isLogin: function() {
      return this.$store.getters.isLogin;
    }
  },
  watch:{
    $route(to, from) {
      this.activeMenu();
    }
  },
  methods: {
    init() {
      this.$store.commit("navigate", "nav-otc");
      this.$http.post(this.host + this.api.otc.coin).then(response => {
        if (response.body.code == 0) {
          this.coins = response.body.data;
          this.activeMenu();
          this.$nextTick(function() {
            this.$refs.navMenu.updateActiveName();
          });
        }
      });
    },
    goBusiness() {
      if (this.isLogin) {
        this.$router.push({
          path: "/identbusiness"
        });
      } else {
        this.$Message.warning(this.$t("common.loginfirst"));
      }
    },
    menuSelected(menuName) {
      if (menuName.startsWith("coin")) {
        var coin = this.coins[menuName.split("-")[1]];
        this.$router.push("/otc/trade/" + coin.unit);
      } else {
        this.$router.push("/otc/" + menuName);
      }
    },
    activeMenu() {
      let coin = this.$route.params[0] || "USDT";
      coin = coin.toUpperCase();
      let index=0;
      this.coins.forEach((v,i)=>{
        if(v.unit===coin){
          index=i;
        }
      })
      this.activeMenuName = `coin-${index}`;
      this.$nextTick(function() {
        this.$refs.navMenu.updateActiveName();
      });
    }
  },
  created: function() {
    this.init();
    // this.activeMenuName = "coin-1";
    // this.$nextTick(function() {
    // this.$refs.navMenu.updateActiveName();
    // });
  }
};
</script>
