<template>
  <div class="content-wraps">
    <div class="containers" id="List">
      <div class="fiat">
        <div class="to_business">
          <h3>Fiat Trading</h3>
          <span>Buy and sell digital assets quickly and safely</span>
          <a href="javascript:void(0)" @click="goBusiness">Become a merchant</a>
          <!-- <router-link to="/identbusiness">Become a merchant</router-link> -->
        </div>
      </div>
      <!-- B12 craft: desk dual-book shell around OTC market list. -->
      <div class="content ix-money ix-otc">
        <p class="ix-dualbook" role="note">
          <strong>Two books.</strong> OTC balances here are venue P2P books — not the TypeScript platform ledgers.
        </p>
        <!-- Stream A: empty coin list ≠ coin API down. -->
        <p v-if="coinsError" class="ix-empty ix-empty-error" role="alert" tabindex="-1">{{ coinsError }}</p>
        <p v-else-if="coinsLoading" class="ix-empty ix-empty-loading">{{ $t('common.loading') }}</p>
        <p v-else-if="coinsReachable && coins.length === 0" class="ix-empty">{{ $t('otc.coinsEmpty') }}</p>
        <Menu v-if="!coinsError && coins.length > 0" ref="navMenu" mode="horizontal" width="auto" :active-name="activeMenuName" @on-select="menuSelected" class='tradelist'>
          <MenuGroup>
            <template v-for="(coin,index) in coins">
              <MenuItem :name="'coin-'+index"> {{coin.unit}}
              </MenuItem>
            </template>
          </MenuGroup>
        </Menu>
        <router-view v-if="!coinsError"></router-view>
      </div>
      <div class="advantage">
        <ul>
          <li>
            <div class="image"><img src="../../assets/images/price.png" alt=""></div>
            <div class="title">One market price</div>
            <div class="content1">Tracks the market in real time</div>
          </li>
          <li>
            <div class="image"><img src="../../assets/images/poundage.png" alt=""></div>
            <div class="title">Quoted price only</div>
            <div class="content1">Merchant quote is the deal price — no hidden platform fee line (not a free-money claim)</div>
          </li>
          <li>
            <div class="image"><img src="../../assets/images/instant.png" alt=""></div>
            <div class="title">Instant settlement</div>
            <div class="content1">Verified merchants are matched automatically — no waiting in a queue</div>
          </li>
          <li>
            <div class="image"><img src="../../assets/images/platedanbao.png" alt=""></div>
            <div class="title">Platform escrow</div>
            <div class="content1">Verified merchants, escrowed funds and 24/7 support on every trade</div>
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
/* B12 — dual-book callout parity with desk money shell */
.ix-money.ix-otc {
  padding: 12px 14px 18px;
  border: 1px solid var(--ix-border, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  background: var(--ix-panel, #12151c);
}
.ix-dualbook {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(0, 194, 168, 0.35);
  border-radius: 6px;
  background: rgba(0, 194, 168, 0.06);
  color: #c8cdd4;
  font-size: 12.5px;
  line-height: 1.5;
}
.ix-dualbook strong {
  color: #00c2a8;
  font-weight: 600;
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
              color: #1ad4bc;
              border-bottom: 0;
            }
          }
          li.ivu-menu-item.ivu-menu-item-active.ivu-menu-item-selected {
            color: #1ad4bc;
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
      coinsLoading: true,
      coinsReachable: false,
      coinsError: "",
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
      this.coinsLoading = true;
      this.coinsError = "";
      this.coinsReachable = false;
      this.$http
        .post(this.host + this.api.otc.coin)
        .then(response => {
          var body = response.body;
          if (body && body.code == 0) {
            this.coins = body.data || [];
            this.coinsReachable = true;
            this.coinsLoading = false;
            this.activeMenu();
            this.$nextTick(function() {
              if (this.$refs.navMenu) {
                this.$refs.navMenu.updateActiveName();
              }
            });
          } else {
            this.coinsError =
              this.$t("otc.coinsUnavailable") ||
              "OTC markets did not answer — list is unknown, not empty.";
            this.coinsLoading = false;
          }
        })
        .catch(() => {
          this.coinsError =
            this.$t("otc.coinsUnavailable") ||
            "OTC markets service did not respond — list is unknown, not empty.";
          this.coinsLoading = false;
        });
    },
    goBusiness() {
      if (this.isLogin) {
        this.$router.push({
          path: "/identbusiness"
        });
      } else {
        this.$Message.warning("Please sign in first");
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
      if (!this.coins.length) {
        return;
      }
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
        if (this.$refs.navMenu) {
          this.$refs.navMenu.updateActiveName();
        }
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
