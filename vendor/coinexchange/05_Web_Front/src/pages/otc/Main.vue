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
      <div class="content ix-money ix-otc">
        <p class="ix-dualbook" role="note">
          <strong>One book.</strong> OTC escrow is posted to the platform ledger — the same book as every other module. Amounts are decimal strings end to end.
        </p>
        <IxState
          :loading="assets.loading"
          :reason="assets.reason"
          :message="assets.message"
          endpoint="/api/p2p/trpc/offers.list"
        >
          <p v-if="!units.length" class="ix-empty">{{ $t('otc.coinsEmpty') }}</p>
          <Menu v-else ref="navMenu" mode="horizontal" width="auto" :active-name="activeMenuName" @on-select="menuSelected" class='tradelist'>
            <MenuGroup>
              <template v-for="(unit,index) in units">
                <MenuItem :name="'coin-'+index"> {{unit}}
                </MenuItem>
              </template>
            </MenuGroup>
          </Menu>
          <router-view></router-view>
        </IxState>
      </div>
      <!--
        These four cards are claims about the product, so they are held to the
        same standard as a number on a screen. Two of the vendor's originals
        were not true of what runs here and were rewritten rather than kept:

        - "Instant settlement — merchants are matched automatically, no waiting
          in a queue." Nothing is matched automatically. A taker picks an offer
          and the seller has to release; the deadline on the trade exists
          precisely because that step takes human time.
        - "…and 24/7 support on every trade." There is no support desk of any
          kind behind the edge — see the support socket on /help. Advertising a
          support channel that does not exist is the worst of these, because a
          reader in a dispute relies on it.
      -->
      <div class="advantage">
        <ul>
          <li>
            <div class="image"><img src="../../assets/images/price.png" alt=""></div>
            <div class="title">The maker sets the price</div>
            <div class="content1">Fixed or floating, quoted per offer. Nothing here is a platform quote.</div>
          </li>
          <li>
            <div class="image"><img src="../../assets/images/poundage.png" alt=""></div>
            <div class="title">Quoted price only</div>
            <div class="content1">The merchant quote is the deal price — there is no hidden platform fee line.</div>
          </li>
          <li>
            <div class="image"><img src="../../assets/images/instant.png" alt=""></div>
            <div class="title">Settles when the seller releases</div>
            <div class="content1">Not automatic. Each trade carries a deadline, and either side can open a dispute.</div>
          </li>
          <li>
            <div class="image"><img src="../../assets/images/platedanbao.png" alt=""></div>
            <div class="title">Escrowed on the ledger</div>
            <div class="content1">The asset is locked on the platform ledger when the trade opens, and released or refunded from there.</div>
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
/**
 * THE OTC DESK SHELL — the asset tabs, and the frame the offer list sits in.
 *
 * WHERE THE TAB LIST COMES FROM NOW. The vendor read `/otc/coin/all`, a Java
 * table of coins configured for OTC. svc-p2p has no equivalent: it does not
 * keep a list of tradeable assets, because an asset is tradeable exactly when
 * somebody has posted an offer in it. So the tabs are DERIVED from the distinct
 * `asset` values on live offers, which is a stronger statement than the vendor's
 * table ever made — a tab here means there is something behind it.
 *
 * The consequence is deliberate: when `offers.list` is refused, there are no
 * tabs, and the refusal is shown instead. Rendering a plausible USDT/BTC/ETH
 * strip while the call was refused would be inventing a market.
 *
 * WHY THE WHOLE DESK IS INSIDE IxState. The child route (Trade.vue) lists
 * offers for the selected asset. If the offer read is refused there is nothing
 * for the child to show either, so the refusal belongs at this level, once,
 * rather than repeated in every pane.
 *
 * `offers.list` is `scopedProcedure('p2p:read', { module: 'p2p' })`. An
 * interactive session does carry `p2p:read`, so the usual refusal here is the
 * jurisdiction matrix (verification tier "basic"), not a missing scope — and
 * IxState words those two differently on purpose.
 */
import IxState from "../../components/intafaced/IxState.vue";
import ixModule from "../../components/intafaced/module-mixin.js";
import { query } from "../../config/intafaced.js";

export default {
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      assets: this.emptySection(),
      activeMenuName: "coin-0"
    };
  },
  computed: {
    isLogin: function() {
      return this.$store.getters.isLogin;
    },
    /** Distinct assets across live offers, in first-seen order. */
    units: function() {
      var offers = this.assets.data;
      if (!offers || !offers.length) return [];
      var seen = {};
      var out = [];
      for (var i = 0; i < offers.length; i++) {
        var a = offers[i].asset;
        if (a && !seen[a]) {
          seen[a] = true;
          out.push(a);
        }
      }
      return out;
    }
  },
  watch: {
    $route: function() {
      this.activeMenu();
    }
  },
  methods: {
    init() {
      this.$store.commit("navigate", "nav-otc");
      var self = this;
      this.load("assets", query("p2p", "offers.list", undefined, this.ixToken)).then(function() {
        self.activeMenu();
      });
    },
    goBusiness() {
      if (this.isLogin) {
        this.$router.push({ path: "/identbusiness" });
      } else {
        this.$Message.warning(this.$t("otc.signInFirst"));
      }
    },
    menuSelected(menuName) {
      if (menuName.indexOf("coin") === 0) {
        var unit = this.units[menuName.split("-")[1]];
        if (unit) this.$router.push("/otc/trade/" + unit);
      } else {
        this.$router.push("/otc/" + menuName);
      }
    },
    activeMenu() {
      var units = this.units;
      if (!units.length) return;
      // No default asset is assumed. The vendor fell back to "USDT" whether or
      // not USDT was in the list; the first asset that actually has an offer is
      // the only defensible default.
      var wanted = (this.$route.params[0] || units[0]).toUpperCase();
      var index = 0;
      for (var i = 0; i < units.length; i++) {
        if (units[i].toUpperCase() === wanted) index = i;
      }
      this.activeMenuName = "coin-" + index;
      this.$nextTick(function() {
        if (this.$refs.navMenu) this.$refs.navMenu.updateActiveName();
      });
    }
  },
  created: function() {
    this.init();
  }
};
</script>
