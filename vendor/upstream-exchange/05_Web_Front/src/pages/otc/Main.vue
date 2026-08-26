<template>
  <div class="ix-page bank-page otc-page" id="List">
    <div class="ix-page-head">
      <h1>{{ $t("otc.mainHonest.title") }}</h1>
      <p>{{ $t("otc.mainHonest.subtitle") }}</p>
      <details class="bank-details"><summary>Details</summary><code>svc-p2p · /api/p2p/trpc/offers.list</code></details>
    </div>
    <nav class="p2p-jump-nav" aria-label="P2P workspace">
      <router-link to="/p2p">Operations</router-link>
      <router-link to="/otc/trade/usdt" class="is-current">Offer desk</router-link>
    </nav>
    <div class="otc-merchant-action">
      <button type="button" @click="goBusiness">{{ $t("otc.mainHonest.becomeMerchant") }}</button>
    </div>
    <div class="content ix-money ix-otc">
      <p class="ix-dualbook ix-note ix-note-quiet" role="note">
        <strong>{{ $t("otc.mainHonest.oneBook") }}</strong> {{ $t("otc.mainHonest.oneBookBody") }}
      </p>
      <IxState compact
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
      <details class="otc-market-notes bank-details">
        <summary>How this market works</summary>
        <div class="advantage"><ul>
          <li>
            <div class="image"><img src="../../assets/images/price.png" alt=""></div>
            <div class="title">{{ $t("otc.mainHonest.makerSets") }}</div>
            <div class="content1">{{ $t("otc.mainHonest.makerSetsBody") }}</div>
          </li>
          <li>
            <div class="image"><img src="../../assets/images/poundage.png" alt=""></div>
            <div class="title">{{ $t("otc.mainHonest.quotedOnly") }}</div>
            <div class="content1">{{ $t("otc.mainHonest.quotedOnlyBody") }}</div>
          </li>
          <li>
            <div class="image"><img src="../../assets/images/instant.png" alt=""></div>
            <div class="title">{{ $t("otc.mainHonest.settlesWhen") }}</div>
            <div class="content1">{{ $t("otc.mainHonest.settlesWhenBody") }}</div>
          </li>
          <li>
            <div class="image"><img src="../../assets/images/platedanbao.png" alt=""></div>
            <div class="title">{{ $t("otc.mainHonest.escrowed") }}</div>
            <div class="content1">{{ $t("otc.mainHonest.escrowedBody") }}</div>
          </li>
        </ul></div>
      </details>
  </div>
</template>

<style scoped lang="scss">
.otc-page {
  .p2p-jump-nav {
    position: sticky;
    top: 48px;
    z-index: 5;
    display: flex;
    gap: 18px;
    margin: 0 -20px 14px;
    padding: 9px 20px;
    overflow-x: auto;
    white-space: nowrap;
    background: rgba(0, 0, 0, .96);
    border-top: 1px solid #202020;
    border-bottom: 1px solid #202020;
    a { color: #8a8a8a; text-decoration: none; }
    a:hover, a:focus, a.is-current { color: #fff; }
  }
  .otc-merchant-action {
    margin-bottom: 12px;
    button {
      padding: 7px 10px;
      color: #c8c8c8;
      background: #000;
      border: 1px solid #343434;
      border-radius: 0;
      font: 11px/1.2 ui-monospace, Menlo, Monaco, Consolas, monospace;
      cursor: pointer;
    }
  }
  .content {
      width: 100%;
      margin: 18px auto 0;
      background: #000;
    }
  .ix-money.ix-otc {
      padding: 0;
      border: 0;
      border-radius: 0;
      background: #000;
    }
  .ix-dualbook {
      margin: 0 0 12px;
      padding: 9px 11px;
      color: #8a8a8a;
      background: #080808;
      border: 1px solid #202020;
      border-radius: 0;
      font-size: 11px;
      line-height: 1.45;
      strong { color: #c8c8c8; font-weight: 500; }
    }
  .otc-market-notes {
      margin-top: 18px;
      padding: 10px 0;
      color: #707070;
      border-top: 1px solid #202020;
      border-bottom: 1px solid #202020;
      summary { cursor: pointer; font: 11px/1.4 ui-monospace, Menlo, Monaco, Consolas, monospace; }
    }
  .advantage {
      ul {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1px;
        margin: 10px 0 0;
        padding: 1px;
        background: #202020;
        li {
          min-width: 0;
          padding: 14px;
          list-style-type: none;
          background: #000;
          div.image { display: none; }
          div.title {
            color: #c8c8c8;
            font-size: 12px;
            line-height: 1.4;
          }
          div.content1 {
            padding-top: 6px;
            color: #707070;
            font-size: 11px;
            line-height: 1.45;
          }
        }
      }
    }
}
@media (max-width: 700px) {
  .otc-page {
    .p2p-jump-nav { margin: 0 -12px 14px; padding: 8px 12px; }
    .advantage ul { grid-template-columns: 1fr; }
  }
}
</style>
<style lang="scss">
.otc-page {
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
              color: #e2e2e2;
              border-bottom: 0;
            }
          }
          li.ivu-menu-item.ivu-menu-item-active.ivu-menu-item-selected {
            color: #e2e2e2;
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
