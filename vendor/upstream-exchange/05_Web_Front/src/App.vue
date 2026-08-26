<template>
  <div :class="[pageView, { 'is-terminal-route': isTerminalRoute, 'is-money-os-route': isMoneyOsRoute }]">
    <div class="page-content" :class="{ 'is-terminal': isTerminalRoute, 'is-money-os': isMoneyOsRoute }">
      <div class="time_download" style="display: none;">
        <div class="leftwrapper">
          <!-- <img src="../src/assets/images/clock.png" alt="" class="clock"> -->
          <Icon type="ios-clock-outline" class="clock"></Icon>
          <span>{{time|dateFormat}}&#160;&#160;{{utc}}</span>
        </div>
      </div>
      <header v-if="isMoneyOsRoute" class="money-os-header">
        <router-link to="/uc/money" class="money-os-brand">INTAFACED</router-link>
        <span class="money-os-module">{{ osModuleLabel }}</span>
        <span class="money-os-header-grow"></span>
        <router-link v-if="isBankRoute || isPayRoute || isP2PRoute || isPlatformModuleRoute" to="/uc/money" class="money-os-chip">Money</router-link>
        <router-link v-if="isPlatformModuleRoute" to="/platform" class="money-os-chip">Platform</router-link>
        <router-link v-if="isPayRoute || isP2PRoute" to="/bank" class="money-os-chip">Bank</router-link>
        <router-link v-if="isP2PRoute" to="/pay" class="money-os-chip">Pay</router-link>
        <router-link to="/exchange" class="money-os-chip">Desk</router-link>
        <router-link v-if="!isLogin" to="/login" class="money-os-account">Sign in</router-link>
        <router-link v-else to="/uc/money" class="money-os-account">{{ strpo(member.username || 'Account') }}</router-link>
      </header>
      <header v-else-if="isMarketingRoute" class="marketing-os-header">
        <router-link to="/" class="marketing-os-brand">INTAFACED</router-link>
        <nav aria-label="Primary">
          <router-link to="/exchange">Desk</router-link>
          <router-link to="/uc/money">Money</router-link>
          <router-link to="/pay">Pay</router-link>
          <router-link to="/platform">Platform</router-link>
        </nav>
        <span class="marketing-os-grow"></span>
        <router-link v-if="!isLogin" to="/login" class="marketing-os-account">Sign in</router-link>
        <router-link v-else to="/uc/money" class="marketing-os-account">{{ strpo(member.username || 'Account') }}</router-link>
      </header>
      <div class="layout" v-if="!isTerminalRoute && !isMoneyOsRoute && !isMarketingRoute">
        <div class="layout-ceiling">
          <router-link to="/">
            <div class="layout-logo"></div>
          </router-link>
          <div class="layout-ceiling-main">
            <!-- header -->
            <div class="header_nav">
              <Menu :active-name="activeNav" width="auto" :open-names="['1']">
                <Submenu name="1">
                  <router-link v-if="!isTerminalRoute" to="/">
                    <MenuItem name="nav-index">{{$t("header.index")}}</MenuItem>
                  </router-link>
                  <router-link to="/exchange">
                    <MenuItem name="nav-exchange">{{$t("header.exchange")}}</MenuItem>
                  </router-link>
                  <!-- Plane switch: custodial Exchange (CEX) vs protocol DEX.
                       Backend access rules already differ by plane; this only
                       surfaces the choice. Not a second design system. -->
                  <span class="ix-plane" role="group" :aria-label="$t('header.planeLabel')">
                    <router-link
                      to="/exchange"
                      class="ix-plane-btn"
                      :class="{ 'is-active': planeIsCex }"
                      :title="$t('header.planeCexHint')"
                    >{{$t("header.planeCex")}}</router-link>
                    <router-link
                      to="/dex"
                      class="ix-plane-btn"
                      :class="{ 'is-active': planeIsDex }"
                      :title="$t('header.planeDexHint')"
                    >{{$t("header.planeDex")}}</router-link>
                  </span>
                  <router-link v-if="!isTerminalRoute" to="/ctc">
                    <MenuItem name="nav-ctc">{{$t("header.ctc")}}</MenuItem>
                  </router-link>
                  <router-link to="/otc/trade/usdt" style="display:none;">
                    <MenuItem name="nav-otc">{{$t("header.otc")}}</MenuItem>
                  </router-link>
                  <router-link v-if="!isTerminalRoute" to="/lab" style="position:relative;">
                    <MenuItem name="nav-lab">{{$t("header.lab")}}</MenuItem>
                  </router-link>
                  <router-link v-if="!isTerminalRoute" to="/invite">
                    <MenuItem name="nav-invite">{{$t("header.invite")}}</MenuItem>
                  </router-link>
                  <router-link v-if="!isTerminalRoute" to="/notice">
                    <MenuItem name="nav-service">{{$t("header.service")}}</MenuItem>
                  </router-link>
                  <!-- The White Paper item is gone with its route. It opened a
                       screen whose entire content was an <embed> of
                       /static/INTAFACEDWhitePaperVer 1.0.pdf — a file that 404s,
                       because this tree has no static/ directory — above a link
                       to a raw.githubusercontent URL for the same missing file.
                       A permanent header slot pointing at a grey box is worse
                       than no slot: it advertises a document we do not have. -->
                </Submenu>
              </Menu>
            </div>
            <!-- INTAFACED platform.
                 One header slot for eleven modules, because eleven more items
                 in the bar would wrap it. The dropdown reaches each module
                 directly; the title itself opens the hub, which holds the
                 platform session and reports what each module can actually do
                 today. Same Dropdown pattern as the account menu below, so the
                 layout is not carrying a second navigation idiom. -->
            <div class="header_nav ix-nav">
              <Dropdown @on-click="goModule">
                <router-link to="/platform" class="ix-nav-title">
                  {{$t("header.platform")}}
                  <Icon type="md-arrow-dropdown" size="16" />
                </router-link>
                <DropdownMenu slot="list">
                  <DropdownItem v-for="m in ixModules" :key="m.key" :name="m.route">
                    {{$t("intafaced.modules." + m.key + ".title")}}
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
            <div class="header_nav ix-nav ix-lang">
              <Dropdown @on-click="changeLanguage">
                <a href="javascript:void(0)" class="ix-nav-title" :aria-label="$t('intafaced.i18n.label')">
                  {{ $t('intafaced.i18n.label') }}
                  <Icon type="md-arrow-dropdown" size="16" />
                </a>
                <DropdownMenu slot="list">
                  <DropdownItem
                    v-for="loc in languageOptions"
                    :key="loc.code"
                    :name="loc.code"
                    :selected="currentLocale === loc.code"
                  >
                    {{ $t('intafaced.i18n.' + loc.code) }}
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
            <div class="header_nav_mobile_triggle" @click="toggleMemu()">
              <Icon type="md-menu" style="font-size: 26px;color:#cccccc;"/>
            </div>
            <!-- App-download entry removed. The QR it showed was the upstream
                 vendor's, and the button behind it fetched an APK that has never
                 existed in this repo. /app still routes, and now says so. -->
            <div class="rr login-container">
              <!-- check whether signed in -->
              <!-- signed in -->
              <div class="login_register isLogin" v-if="isLogin">
                <div class="mymsg">
                  <router-link to="/uc/safe">{{$t("header.usercenter")}}</router-link>
                </div>
                <Dropdown>
                  <a href="javascript:void(0)">
                    <Icon type="md-person" size="20" />
                    <span>{{strpo(member.username)}}</span>
                    <Icon type="md-arrow-dropdown" size="16" />
                  </a>
                  <DropdownMenu slot="list">
                      <DropdownItem>
                        <router-link to="/uc/money">
                          <Icon type="logo-bitcoin" /> &nbsp;{{$t("header.assetmanage")}}
                        </router-link>
                      </DropdownItem>
                      <DropdownItem>
                        <router-link to="/uc/entrust/current">
                          <Icon type="md-swap" /> &nbsp;{{$t("header.trademanage")}}
                        </router-link>
                      </DropdownItem>
                      <DropdownItem>
                        <router-link to="/uc/innovation/myorders">
                          <Icon type="md-swap" /> &nbsp;{{$t("header.innovationmanage")}}
                        </router-link>
                      </DropdownItem>
                      <DropdownItem>
                        <div @click="logout">
                          <Icon type="md-log-out" /> &nbsp;{{$t("common.logout")}}
                        </div>
                      </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </div>
              <!-- signed out -->
              <div class="login_register" v-else>
                <Menu active-name11="1-1" width="auto" :open-names="['2']">
                  <Submenu name="2" id="login_register_theme">
                    <router-link to="/login" id="login">
                      <MenuItem name="1-1">{{$t("common.login")}}</MenuItem>
                    </router-link>
                    <router-link to="/register" id="register">
                      <MenuItem name="1-2">{{$t("common.register")}}</MenuItem>
                    </router-link>
                  </Submenu>
                </Menu>
              </div>
            </div>
          </div>
        </div>
      </div>
      <router-view v-if="isRouterAlive"></router-view>
      <!-- </div> -->
    </div>
    <Drawer v-if="!isTerminalRoute && !isMoneyOsRoute" :closable="true" width="40" v-model="navDrawerModal" class="header_nav_mobile">
        <Menu :active-name="activeNav" width="auto" @on-select="onMobileSelect">
            <MenuItem name="nav-index" style="text-align:left;">{{$t("header.index")}}</MenuItem>
            <MenuItem name="nav-exchange" style="text-align:left;">{{$t("header.exchange")}} · {{$t("header.planeCex")}}</MenuItem>
            <MenuItem name="nav-dex" style="text-align:left;">{{$t("header.planeDex")}}</MenuItem>
            <MenuItem name="nav-ctc" style="text-align:left;">{{$t("header.ctc")}}</MenuItem>
            <router-link to="/otc/trade/usdt" style="display:none;">
              <MenuItem name="nav-otc" style="text-align:left;">{{$t("header.otc")}}</MenuItem>
            </router-link>
            <router-link to="/lab">
              <MenuItem name="nav-lab" style="text-align:left;color:#bdc2ca;">{{$t("header.lab")}}</MenuItem>
            </router-link>
            <MenuItem name="nav-invite" style="text-align:left;">{{$t("header.invite")}}</MenuItem>
            <router-link to="/notice">
              <MenuItem name="nav-service" style="text-align:left;color:#bdc2ca;">{{$t("header.service")}}</MenuItem>
            </router-link>
            <!-- White Paper removed here for the same reason as the header: the
                 route served an <embed> of a PDF that does not exist. -->
            <!-- The same eleven modules on mobile, where a hover dropdown is
                 not usable. Expanded inline rather than hidden behind the hub,
                 so every module is one tap from the drawer. -->
            <Submenu name="nav-platform-mobile">
              <template slot="title" class="lang-title">
                <span style="color:#bdc2ca;">{{$t("header.platform")}}</span>
              </template>
              <router-link to="/platform">
                <MenuItem name="nav-platform" class="lang-item" style="padding-left:20px!important;">{{$t("intafaced.hub.title")}}</MenuItem>
              </router-link>
              <router-link v-for="m in ixModules" :key="m.key" :to="m.route">
                <MenuItem :name="'nav-ix-' + m.key" class="lang-item" style="padding-left:20px!important;">
                  {{$t("intafaced.modules." + m.key + ".title")}}
                  <span v-if="m.state === 'partial'" style="opacity:0.55;font-size:11px;"> · partial</span>
                  <span v-else-if="m.state === 'absent'" style="opacity:0.55;font-size:11px;"> · offline</span>
                </MenuItem>
              </router-link>
            </Submenu>
            <Submenu name="nav-login" id="login_register_theme" v-if="!isLogin">
              <template slot="title" class="lang-title">
                  <span style="color:#bdc2ca;">{{$t("common.loginregister")}}</span>
              </template>
              <router-link to="/login" id="login">
                <MenuItem name="1-1" class="lang-item" style="padding-left:20px!important;">{{$t("common.login")}}</MenuItem>
              </router-link>
              <router-link to="/register" id="register">
                <MenuItem name="1-2" class="lang-item" style="padding-left:20px!important;">{{$t("common.register")}}</MenuItem>
              </router-link>
            </Submenu>
            <Submenu name="nav_personal" v-if="isLogin">
                <template slot="title" class="lang-title">
                  <span style="color:#bdc2ca;">{{$t("header.usercenter")}}</span>
                </template>
                <router-link to="/uc/safe">
                  <MenuItem name="nav_safe" class="lang-item" style="padding-left:20px!important;">{{$t("uc.member.securitysetting")}}</MenuItem>
                </router-link>
                <router-link to="/uc/money">
                  <MenuItem name="nav_assets" class="lang-item" style="padding-left:20px!important;">{{$t("header.assetmanage")}}</MenuItem>
                </router-link>
                <!-- Was /uc/innovation/myminings; that screen is deleted (see
                     config/sockets.js REMOVED). Pointed at the sibling that
                     still exists rather than left dangling — a mobile menu item
                     resolving to the catch-all route lands on the home page with
                     no explanation, which is the hang this pass was fixing. -->
                <router-link to="/uc/innovation/myorders">
                  <MenuItem name="nav_innnovationmanage" class="lang-item" style="padding-left:20px!important;">{{$t("header.innovationmanage")}}</MenuItem>
                </router-link>
            </Submenu>
            <Submenu name="nav-lang">
              <template slot="title" class="lang-title">
                <span style="color:#bdc2ca;">{{$t("intafaced.i18n.label")}}</span>
              </template>
              <MenuItem
                v-for="loc in languageOptions"
                :key="loc.code"
                :name="'lang-' + loc.code"
                class="lang-item"
                style="padding-left:20px!important;"
              >{{ $t('intafaced.i18n.' + loc.code) }}</MenuItem>
            </Submenu>
        </Menu>
    </Drawer>
    <!-- B2 density: marketing footer stays on marketing pages only — on the
         trading desk it steals a full viewport of dead black (Design Bar §3.2). -->
    <div class="footer" v-if="!isTerminalRoute && !isMoneyOsRoute">
      <div class="footer_content">
        <div class="footer_left">
          <img src="./assets/images/logo-bottom.svg" style="margin:0" ></img>
          <p style="letter-spacing:2px;">{{$t("footer.gsmc")}}</p>
          <!-- No year and no rights claim we cannot stand behind. The upstream
               line said "Copyright © 2019" — that is the vendor's first-publish
               year, not ours, and stating it is a false provenance claim. -->
          <p>{{ $t("shellResidual.copyright") }}</p>
          <!-- Social row removed rather than rewritten. Every entry was either a
               China-only platform the upstream vendor used (WeChat, Weibo,
               Biyong) or a profile URL invented for us that resolves to nothing
               (twitter.com/INTAFACEDGlobal, medium.com/@INTAFACED,
               reddit.com/u/intafacedglobal). The three QR images were the
               vendor's own accounts — a customer scanning one reached a stranger.
               Same idiom already used on /about-us and /partner. -->
          <p class="footer-quiet">{{ $t("shellResidual.socialNotPublished") }}</p>
        </div>
        <!-- "Friendly links" column removed: Feixiaohao, 8BTC, ChainNode and
             Jinse Finance are Chinese crypto-media partners of the upstream
             vendor. We have no relationship with any of them, and linking out
             to four third parties from every page implied that we do. -->
        <div class="footer_right">
          <ul>
            <li class="footer_title">
              <span>{{$t("footer.gsjj")}}</span>
            </li>
            <li>
              <router-link target="_blank" to="/about-us">{{$t("footer.gywm")}}</router-link>
            </li>
            <li>
              <router-link target="_blank" to="/help">{{$t("footer.jrwm")}}</router-link>
            </li>
            <li>
              <router-link target="_blank" to="/notice">{{$t("footer.notice")}}</router-link>
            </li>
            <!-- "Api Doc" was a link to nowhere whose hover text read
                 "come soon". A menu entry that only ever says it does not exist
                 is noise; the row returns when there is a document to open. -->
          </ul>
          <ul>
            <li class="footer_title">
              <span>{{$t("footer.bzzx")}}</span>
            </li>
            <li>
              <router-link target="_blank" to="/help">{{$t("footer.xszn")}}</router-link>
            </li>
            <li>
              <router-link target="_blank" to="/help">{{$t("footer.cjwt")}}</router-link>
            </li>
            <li>
              <router-link target="_blank" to="/help">{{$t("footer.jyzn")}}</router-link>
            </li>
            <li>
              <router-link target="_blank" to="/help">{{$t("footer.bzzl")}}</router-link>
            </li>
          </ul>
          <ul>
            <li class="footer_title">
              <span>{{$t("footer.tkxy")}}</span>
            </li>
            <li>
              <router-link target="_blank" to="/help">{{$t("footer.mztk")}}</router-link>
            </li>
            <li>
              <router-link target="_blank" to="/help">{{$t("footer.ystk")}}</router-link>
            </li>
            <li>
              <router-link target="_blank" to="/help">{{$t("footer.fwtk")}}</router-link>
            </li>
            <li>
              <router-link target="_blank" to="/help">{{$t("footer.fltk")}}</router-link>
            </li>
          </ul>
          <!-- Contact column. The four addresses that used to sit in these
               popovers (service@ / support@ / list@ / ceo@) were never
               provisioned — mail to them goes nowhere, which is worse than
               publishing no address at all because the sender believes they have
               been heard. /about-us and /partner were already corrected to this
               wording; the footer, which renders on every marketing page, was
               missed. -->
          <ul>
            <li class="footer_title">
              <span>{{$t("footer.lxwm")}}</span>
            </li>
            <li class="footer-quiet">{{$t("footer.kfyx")}} {{ $t("shellResidual.notPublishedYet") }}</li>
            <li class="footer-quiet">{{$t("footer.swhz")}} {{ $t("shellResidual.notPublishedYet") }}</li>
            <li class="footer-quiet">{{$t("footer.sbsq")}} {{ $t("shellResidual.notPublishedYet") }}</li>
            <li class="footer-quiet">{{$t("footer.tsjb")}} {{ $t("shellResidual.notPublishedYet") }}</li>
          </ul>
        </div>
      </div>
    </div>
    <template>
      <BackTop :bottom="50"></BackTop>
    </template>
    <!-- B-CMDK: global route/market palette (⌘K / Ctrl+K). iView-free panel; tokens only. -->
    <CommandPalette />
  </div>
</template>
<script>
import Vue from "vue";
import { mapGetters, mapActions } from "vuex";
// The one list of INTAFACED modules. The header dropdown, the mobile drawer and
// the hub all read it, so a module cannot appear in one navigation and not the
// others.
import { MODULES as IX_MODULES, mutate } from "./config/intafaced.js";
import CommandPalette from "./components/intafaced/CommandPalette.vue";

var I18N_STORAGE_KEY = "intafaced.i18n.locale";
var I18N_FALLBACK = "en";
/** Locales that have vendor lang files. Never offer a code without a file. */
var I18N_SHIPPED = [
  { code: "en" },
  { code: "es" },
  { code: "fr" }
];
function unwrapCatalog(mod) {
  if (!mod) return null;
  if (mod.intafaced) return mod;
  if (mod.default && mod.default.intafaced) return mod.default;
  return mod.default || mod;
}
export default {
  name: "app",
  components: { CommandPalette },
  provide () {
    return {
      reload: this.reload
    }
  },
  data() {
    return {
      isRouterAlive: true,
      pageView: "page-view",
      utc: null,
      time: null,
      content: " ",
      navDrawerModal: false,
      ixModules: IX_MODULES,
      currentLocale: I18N_FALLBACK,
      shippedLocales: I18N_SHIPPED
    };
  },
  watch: {
    activeNav: function() {
      switch (this.activeNav) {
        case "nav-exchange":
          window.document.title = this.$t("shellResidual.titleExchange") + " - " + this.$t("shellResidual.titleDefault");
          break;
        case "nav-service":
          window.document.title = this.$t("shellResidual.titleAnnouncement") + " - " + this.$t("shellResidual.titleDefault");
          break;
        case "nav-about":
          window.document.title = this.$t("shellResidual.titleAbout") + " - " + this.$t("shellResidual.titleDefault");
          break;
        case "nav-lab":
          window.document.title = this.$t("shellResidual.titleLab") + " - " + this.$t("shellResidual.titleDefault");
          break;
        case "nav-invite":
          window.document.title = this.$t("shellResidual.titlePromotion") + " - " + this.$t("shellResidual.titleDefault");
          break;
        case "nav-platform":
          window.document.title = this.$t("shellResidual.titlePlatform") + " - " + this.$t("shellResidual.titleDefault");
          break;
        // Set by pages/NotFound.vue. The tab title is the only part of a 404
        // that survives into history and bookmarks, so it should not read as
        // the front page.
        case "nav-notfound":
          window.document.title = this.$t("shellResidual.titleNotFound") + " - " + this.$t("shellResidual.titleDefault");
          break;
        default:
          window.document.title = this.$t("shellResidual.titleDefault");
          break;
      }
    },
    $route(to, from) {
      this.pageView = "page-view";
      if (to.path == "/reg") {
        this.pageView = "page-view2";
        if(!this.isMobile()){
            if(this.$route.query.code!= undefined && this.$route.query.code!= "" && this.$route.query.code!= null){
                this.$router.replace('/register?code='+this.$route.query.code);
            }else{
                this.$router.replace('/register');
            }
        }
      }

      /* Stream A: mobile must reach the trading terminal and platform modules.
         Forcing /reg here was an old app-download funnel that blanked the product
         on phones. Keep funnel only on the dedicated /app download page if needed. */
      if (to.path == "/" || to.path == "/index") {
        /* Home still usable on mobile — do not bounce to register. */
      }

      if (to.path == "/app") {
        this.pageView = "page-view2";
      }

      /* The `/envelope` branch that set page-view3 is gone with that route
         (config/sockets.js REMOVED). The .page-view3 rule stays in this file's
         stylesheet: it is a generic chrome-less layout, not envelope-specific,
         and deleting a style nothing selects is a separate change from
         deleting a product. */
    },
    exchangeSkin() {

    }
  },
  computed: {
    activeNav: function() {
      return this.$store.state.activeNav;
    },
    isLogin: function() {
      return this.$store.getters.isLogin;
    },
    member: function() {
      return this.$store.getters.member;
    },
    languageOptions: function() {
      var self = this;
      return this.shippedLocales.filter(function(loc) {
        return self.hasHealthyCatalog(loc.code);
      });
    },
    exchangeSkin() {
      return this.$store.state.exchangeSkin;
    },
    planeIsCex() {
      var p = (this.$route && this.$route.path) || "";
      return p === "/exchange" || p.indexOf("/exchange/") === 0;
    },
    planeIsDex() {
      var p = (this.$route && this.$route.path) || "";
      return p === "/dex" || p.indexOf("/protocol") === 0 || p.indexOf("/chain") === 0;
    },
    isAuthRoute() {
      var routePath = (this.$route && this.$route.path) || "";
      var browserPath = typeof window !== "undefined" ? window.location.pathname : "";
      var paths = [routePath, browserPath];
      for (var i = 0; i < paths.length; i += 1) {
        var p = paths[i];
        if (p === "/login" || p.indexOf("/login/") === 0 || p === "/register" || p === "/findPwd") return true;
      }
      return false;
    },
    isBankRoute() {
      var routePath = (this.$route && this.$route.path) || "";
      var browserPath = typeof window !== "undefined" ? window.location.pathname : "";
      var paths = [routePath, browserPath];
      for (var i = 0; i < paths.length; i += 1) {
        var p = paths[i];
        if (p === "/bank" || p.indexOf("/bank/") === 0) return true;
      }
      return false;
    },
    isPayRoute() {
      var routePath = (this.$route && this.$route.path) || "";
      var browserPath = typeof window !== "undefined" ? window.location.pathname : "";
      var paths = [routePath, browserPath];
      for (var i = 0; i < paths.length; i += 1) {
        var p = paths[i];
        if (p === "/pay" || p.indexOf("/pay/") === 0) return true;
      }
      return false;
    },
    isP2PRoute() {
      var routePath = (this.$route && this.$route.path) || "";
      var browserPath = typeof window !== "undefined" ? window.location.pathname : "";
      var paths = [routePath, browserPath];
      for (var i = 0; i < paths.length; i += 1) {
        if (paths[i] === "/p2p") return true;
      }
      return false;
    },
    isPlatformModuleRoute() {
      return !!this.platformModuleLabel;
    },
    isMarketingRoute() {
      var routePath = (this.$route && this.$route.path) || "";
      var browserPath = typeof window !== "undefined" ? window.location.pathname : "";
      var paths = [routePath, browserPath];
      var roots = {
        index: true,
        help: true,
        helplist: true,
        helpdetail: true,
        notice: true,
        announcement: true,
        invite: true,
        lab: true,
        partner: true,
        bzb: true,
        "about-us": true,
        app: true
      };
      for (var i = 0; i < paths.length; i += 1) {
        if (paths[i] === "/") return true;
        if (roots[(paths[i] || "").split("/")[1]]) return true;
      }
      return false;
    },
    platformModuleLabel() {
      var routePath = (this.$route && this.$route.path) || "";
      var browserPath = typeof window !== "undefined" ? window.location.pathname : "";
      var roots = {
        market: "MARKET",
        support: "SUPPORT",
        ops: "OPS",
        portfolio: "PORTFOLIO",
        token: "TOKEN",
        agents: "AGENTS",
        blueprint: "BLUEPRINT",
        protocol: "PROTOCOL",
        dex: "DEX",
        chain: "CHAIN",
        academy: "ACADEMY",
        launch: "LAUNCH",
        quant: "QUANT",
        execution: "EXECUTION",
        predict: "PREDICT",
        mining: "MINING"
      };
      var paths = [routePath, browserPath];
      for (var i = 0; i < paths.length; i += 1) {
        var root = (paths[i] || "").split("/")[1];
        if (roots[root]) return roots[root];
      }
      return "";
    },
    osModuleLabel() {
      if (this.isAuthRoute) return "SIGN IN";
      if (this.isBankRoute) return "BANK";
      if (this.isPayRoute) return "PAY";
      if (this.isP2PRoute) return "P2P";
      return this.platformModuleLabel || "MONEY";
    },
    isMoneyOsRoute() {
      var routePath = (this.$route && this.$route.path) || "";
      var browserPath = typeof window !== "undefined" ? window.location.pathname : "";
      var paths = [routePath, browserPath];
      for (var i = 0; i < paths.length; i += 1) {
        var p = paths[i];
        if (p === "/uc" || p.indexOf("/uc/") === 0 || p === "/platform" || p === "/bank" || p.indexOf("/bank/") === 0 || p === "/pay" || p.indexOf("/pay/") === 0 || p === "/p2p") return true;
      }
      return this.isAuthRoute || this.isPlatformModuleRoute;
    },
    /**
     * Full-viewport trading / protocol desks — no marketing footer, no
     * page-content footer pad. Marketing and account pages keep the footer.
     * Audit 2026-08-03 (AFK-FOOTER): added C2C + OTC desks; left /uc/* hub,
     * /platform hub, CMS and auth with footer (not terminal density surfaces).
     */
    isTerminalRoute() {
      var routePath = (this.$route && this.$route.path) || "";
      var browserPath = typeof window !== "undefined" ? window.location.pathname : "";
      var paths = [routePath, browserPath];
      for (var i = 0; i < paths.length; i += 1) {
        var p = paths[i];
        if (p === "/exchange" || p.indexOf("/exchange/") === 0) return true;
        if (p === "/ctc" || p.indexOf("/ctc/") === 0) return true;
        if (p === "/otc" || p.indexOf("/otc/") === 0) return true;
      }
      return false;
    }
  },
  created: function() {
    this.registerShippedCatalogs();
    var stored = null;
    try {
      stored = localStorage.getItem(I18N_STORAGE_KEY);
    } catch (e) {
      stored = null;
    }
    this.applyLocale(stored);
    this.initialize();
    var d = new Date(),
      gmtHours = d.getTimezoneOffset() / 60;
    this.utc = "GMT " + (gmtHours > 0? "-": "+") + " " + String(gmtHours)[1];
    setInterval(() => {
      this.time = new Date().getTime();
    }, 1000);

    let initLoading = document.getElementById("initLoading");
    if(initLoading!= null){
      document.body.removeChild(initLoading);
    }
  },
  methods: {
    reload () {
      this.isRouterAlive = false;
      this.$nextTick(function () {
        this.isRouterAlive = true;
      })
    },
    isMobile() {
  let flag = navigator.userAgent.match(/(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i)
      return flag;
    },
    toggleMemu(){
      this.navDrawerModal =!this.navDrawerModal;
    },
    /** DropdownItem `name` is the route, so this stays a one-liner as modules move. */
    goModule(route) {
      if (route && this.$route.path !== route) this.$router.push(route);
    },
    /** Mobile drawer: routes plus `lang-*` locale codes from the switcher. */
    onMobileSelect(name) {
      var map = {
        "nav-index": "/",
        "nav-exchange": "/exchange",
        "nav-dex": "/dex",
        "nav-ctc": "/ctc",
        "nav-otc": "/otc/trade/usdt",
        "nav-lab": "/lab",
        "nav-invite": "/invite",
        "nav-service": "/notice",
        "nav-platform": "/platform",
        "nav_safe": "/uc/safe",
        "nav_assets": "/uc/money",
        "nav_innnovationmanage": "/uc/innovation/myorders",
        "1-1": "/login",
        "1-2": "/register"
      };
      if (name && name.indexOf("nav-ix-") === 0) {
        var key = name.slice(7);
        var mod = (this.ixModules || []).find(function (m) { return m.key === key; });
        if (mod && mod.route) {
          this.$router.push(mod.route);
          this.navDrawerModal = false;
          return;
        }
      }
      if (name && name.indexOf("lang-") === 0) {
        this.changeLanguage(name.slice(5));
        this.navDrawerModal = false;
        return;
      }
      if (map[name]) {
        this.$router.push(map[name]);
        this.navDrawerModal = false;
      }
    },
    registerShippedCatalogs() {
      if (typeof this.$i18n.setLocaleMessage !== "function") return;
      try {
        var es = unwrapCatalog(require("./assets/lang/es.js"));
        if (es) this.$i18n.setLocaleMessage("es", es);
      } catch (e) {
        /* missing or broken file: do not register; applyLocale stays en */
      }
      try {
        var fr = unwrapCatalog(require("./assets/lang/fr.js"));
        if (fr) this.$i18n.setLocaleMessage("fr", fr);
      } catch (e) {
        /* missing or broken file: do not register; applyLocale stays en */
      }
    },
    hasHealthyCatalog(code) {
      if (!code || code === "zh") return false;
      var messages = this.$i18n.messages && this.$i18n.messages[code];
      if (!messages) return false;
      var bank = messages.intafaced && messages.intafaced.modules && messages.intafaced.modules.bank;
      var title = bank && bank.title;
      return typeof title === "string" && title.length > 0 && title !== "intafaced.modules.bank.title" && title !== "footer.gsmc";
    },
    applyLocale(code) {
      var next = I18N_FALLBACK;
      if (code && this.hasHealthyCatalog(code)) next = code;
      this.$i18n.locale = next;
      this.currentLocale = next;
      try {
        localStorage.setItem(I18N_STORAGE_KEY, next);
      } catch (e) {
        /* private-mode storage refusal is not a reason to fail boot */
      }
    },
    changeLanguage(code) {
      this.applyLocale(code);
    },
    strpo(str) {
      if (str.length > 4) {
        str = str.slice(0, 4) + "…";
      } else {
        str = str;
      }
      return str;
    },
    initialize() {
      this.$store.commit("navigate", "nav-index");
      this.$store.commit("recoveryMember");
      this.$store.commit("initLang");
      this.$store.commit("initLoginTimes");

      // `checkLogin()` used to POST /uc/check/login to the Java ucenter here.
      // There is nothing to ask any more: the session lives in memory, so on a
      // fresh boot there is by definition no session, and `recoveryMember`
      // above has already cleared the stale vendored keys. Asking a dead
      // backend whether we are signed in could only ever hang.
    },
    /**
     * Sign out of svc-identity.
     *
     * `auth.logout` revokes the refresh token server-side; clearing the store
     * drops the access token and the member projection with it. The local
     * clear does NOT wait for the network call — a user who clicks sign out is
     * entitled to be signed out on this device even if the service is
     * unreachable, and leaving them holding a live bearer while a spinner
     * turned would be the wrong failure.
     */
    logout() {
      this.$http.post(this.host + "/uc/loginout", {}).then(response => {
        var resp = response.body;
        if (resp.code == 0) {
          this.$Message.success(resp.message);
          this.$store.commit("setMember", null);
          setTimeout(() => {
            location.href = "/";
          }, 1500);
        } else {
          this.$Message.error(resp.message);
        }
      });
    },
    checkLogin() {
      this.$http.post(this.host + "/uc/check/login", {}).then(response => {
        var result = response.body;
        if (result.code == 0 && result.data == false) {
          this.$store.commit("setMember", null);
        }
      });
    }
  }
};
</script>


<style scoped lang="scss">
.money-os-header {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 20px;
  width: 100%;
  height: 48px;
  padding: 0 12px;
  color: #c8c8c8;
  background: #000;
  border-bottom: 1px solid #202020;
}
.money-os-brand {
  width: 168px;
  color: #e8e8e8;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .04em;
}
.money-os-module {
  color: #e8e8e8;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .1em;
}
.money-os-header-grow { flex: 1; }
.money-os-chip,
.money-os-account {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 3px 9px;
  color: #8a8a8a;
  font-size: 11px;
  border: 1px solid #343434;
}
.money-os-chip:hover,
.money-os-account:hover { color: #e8e8e8; border-color: #606060; }
.marketing-os-header {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 20px;
  width: 100%;
  height: 48px;
  padding: 0 20px;
  color: #c8c8c8;
  background: #000;
  border-bottom: 1px solid #202020;
}
.marketing-os-brand {
  color: #e8e8e8;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .08em;
}
.marketing-os-header nav { display: flex; align-items: center; gap: 18px; }
.marketing-os-header nav a {
  color: #8a8a8a;
  font-size: 11px;
  letter-spacing: .03em;
}
.marketing-os-header nav a:hover { color: #e8e8e8; }
.marketing-os-grow { flex: 1; }
.marketing-os-account {
  flex: 0 0 auto;
  padding: 6px 9px;
  color: #8a8a8a;
  font-size: 11px;
  border: 1px solid #343434;
}
.marketing-os-account:hover { color: #e8e8e8; border-color: #606060; }
.is-money-os-route > .footer { display: none !important; }
@media screen and (max-width: 640px) {
  .money-os-header {
    gap: 6px;
    padding: 0 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .money-os-header::-webkit-scrollbar { display: none; }
  .money-os-brand { display: none; }
  .money-os-module { font-size: 12px; }
  .money-os-header-grow { flex: 0 0 4px; }
  .money-os-chip,
  .money-os-account { flex: 0 0 auto; min-height: 24px; padding: 3px 6px; font-size: 10px; }
  .marketing-os-header { gap: 10px; padding: 0 10px; }
  .marketing-os-header nav { gap: 10px; overflow-x: auto; scrollbar-width: none; }
  .marketing-os-header nav::-webkit-scrollbar { display: none; }
  .marketing-os-header nav a { flex: 0 0 auto; font-size: 10px; }
  .marketing-os-account { padding: 5px 7px; font-size: 10px; }
}
@media screen and (max-width:768px){
.header_nav_mobile_triggle{
    display: inline-block!important;
  }
.footer_content{
    padding: 70px 2% 85px 5%;
  }
.page-view,.page-view2{
.page-content{
.layout{
        height: 45px;
.layout-ceiling{
          padding: 5px 10px!important;
.layout-ceiling-main{
            height: 35px!important;
            line-height: 35px!important;
          }
.layout-logo{
            width: 200px!important;
            height: 35px!important;
          }
        }
      }
    }
  }
}
.header_nav_mobile_triggle{
  display: none;
  float:right;
  padding: 0 5px 0 20px;
}
/* The INTAFACED platform entry. Matches the height and muted-to-orange
   behaviour of the vendor nav items beside it rather than introducing a second
   look in the same bar. */
.ix-nav {
  height: 50px;
  line-height: 50px;
::v-deep.ivu-dropdown-rel {
    display: inline-block;
  }
.ix-nav-title {
    display: inline-block;
    height: 40px;
    line-height: 40px;
    margin-left: 20px;
    font-size: 14px;
    color: #8a8a8a;
    &:hover {
      color: #c8c8c8;
    }
  }
.router-link-active.ix-nav-title {
    color: #c8c8c8;
  }
}
.ix-lang {
  float: right;
}
.ix-lang .ix-nav-title {
  color: #8a8a8a;
  &:hover {
    color: #c8c8c8;
  }
}
/* CEX / DEX plane switch — compact pill matching shell chrome, not a new kit.
   Tokens from intafaced.css (design bar §2 / §3.3 plane unity). */
.ix-plane {
  display: inline-flex;
  vertical-align: middle;
  margin: 0 var(--space-2, 8px) 0 var(--space-3, 12px);
  border: 1px solid var(--border, #2a2a2a);
  border-radius: var(--radius-sm, 4px);
  overflow: hidden;
  height: 28px;
  line-height: 26px;
}
.ix-plane-btn {
  display: inline-block;
  padding: 0 10px;
  font-size: var(--type-12, 12px);
  color: var(--text-muted, #8a8a8a);
  background: transparent;
  text-decoration: none;
  white-space: nowrap;
  &:hover {
    color: var(--accent, #c8c8c8);
  }
  &.is-active {
    color: #fff;
    background: var(--accent, #c8c8c8);
  }
}
@media screen and (max-width: 1100px) {
  .ix-plane {
    display: none;
  }
}
.page-view2.nav-pdf {
  color: #333;
  font-size: 14px;
}
.nav-pdf {
  font-size: 14px;
  color: #fff;
}
.page-view {
  height: 100%;
.page-content {
.time_download {
      padding: 0 80px;
      height: 35px;
      background-color: #000;
      line-height: 35px;
      overflow: hidden;
.leftwrapper {
        float: left;
.clock {
          display: inline-block;
          vertical-align: middle;
          color: #fff;
        }
        span {
          color: #fff;
          line-height: 35px;
          font-size: 12px;
        }
      }
    }
.layout {
      width: 100%;
      position: absolute;
      z-index: 10;
.layout-ceiling {
        padding: 5px 20px;
/* 200px, not 300px: the header gutter is 218px (.layout-ceiling-main
           margin-left), so a 300px lockup ran under the nav and the wordmark
           read "INTAFACE". `contain` rather than `100% 100%` so the mark is not
           stretched to fill a box of the wrong ratio. */
.layout-logo{
          width: 200px;
          height: 37px;
          background: url(./assets/images/logo.svg) no-repeat left center;
          background-size: contain;
          float: left;
          position: absolute;
          z-index: 10;
        }
.layout-ceiling-main {
          height: 50px;
          line-height: 50px;
          margin-left: 218px;
.header_nav {
            li.ivu-menu-submenu.ivu-menu-item-active.ivu-menu-opened.ivu-menu-child-item-active {
              background: none;
.ivu-menu {
                a {
                  &:hover {
                    li {
                      background: none;
                      color: #c8c8c8;
                    }
                  }
                  li.ivu-menu-item.ivu-menu-item-active.ivu-menu-item-selected {
                    color: #c8c8c8;
                        border-bottom: 3px solid #d8d8d8;
                  }
                }
.router-link-exact-active.router-link-active {
                  li {
                    color: #c8c8c8;
                  }
                }
              }
            }
.ivu-menu-vertical.ivu-menu-light {
              background: none;
              &:after {
                width: 0;
              }
            }
          }
        }
.rr {
          float:right;
          z-index: 10;
.mymsg {
            float: left;
            padding-right: 20px;
            a {
              color: #8a8a8a;
              display: inline;
              padding-right: 20px;
              border-right: 1px solid #8a8a8a;
            }
            a:hover{
              color:#FFF;
            }
          }
.login_register {
            float: left;
            padding-right: 20px;
            border-right: 1px solid #292929;
            line-height: 50px;
.ivu-menu {
              background: transparent;
              #login,
              #register {
                display: inline-block;
                min-width: 60px;
                height: 100%;
                text-align: center;
                line-height: 20px;
                margin-left: 0px;
                box-sizing: border-box;
                li {
                  height: 100%;
                  color: #8a8a8a;
                }
                &:hover {
                  li {
                    color: #fff;
                  }
                }
              }
              #login{
                border-right: 1px solid #292929;
              }
              #register {
                color: #c8c8c8!important;
                &:hover {
                  li {
                    color: #fff;
                  }
                }
              }
            }
          }
.isLogin {
.ivu-dropdown {
              display: block;
              float: left;
.ivu-dropdown-rel {
                a {
                  margin-left: 0;
                  color: #8a8a8a;
                }
                a:hover{
                  color:#FFF;
                }
              }
.ivu-select-dropdown {
                position: absolute;
              }
            }
          }
        }
.rightwrapper {
          float: right;
.appdownload {
            float: left;
            // padding: 0 20px;
            padding-right: 0px;
.ivu-poptip-rel {
              a {
                color: #8a8a8a;
              }
              i.ivu-icon.ivu-icon-arrow-down-b {
                margin-left: 5px;
              }
            }
          }
.ios,
.andrio {
            float: left;
            text-align: center;
            img {
              width: 116px;
              height: 116px;
              margin: 0 auto;
              border-radius: 3px;
            }
.tips {
              height: 30px;
              img {
                width: 14px;
                height: 14px;
                margin-top: 5px;
                margin-right: 5px;
              }
              span {
                font-size: 14px;
                // color: #000;
              }
            }
          }
.andrio {
            float: right;
          }
.ivu-dropdown-rel a {
            color: #fff;
          }
.ivu-select-dropdown {
            z-index: 901;
            #change_language_theme {
              li {
                background: #fff;
                color: #333;
              }
            }
          }
.changelanguage {
            float: left;
.languagelogo {
              float: left;
              padding-top: 5px;
              height: 45px;
              padding-left: 15px;
              margin-right: 12px;
            }
          }
        }
      }
    }
  }
}
.page-view2 {
.ivu-select-single.ivu-select-selection{
    background-color: #0f0f0f;
    &:hover{
      border-color: transparent;
    }
    &:focus{
      border-color: transparent;
    }
  }
.ivu-input-group-prepend {
    background-color: #0e0e0e;
    border: 1px solid #0e0e0e;
  }
.page-content {
.time_download {
      padding: 0 80px;
      height: 35px;
      background-color: #000;
      line-height: 35px;
      overflow: hidden;
.leftwrapper {
        float: left;
.clock {
          display: inline-block;
          vertical-align: middle;
          color: #fff;
        }
        span {
          color: #fff;
          line-height: 35px;
          font-size: 12px;
        }
      }
.rightwrapper {
        float: right;
.appdownload {
          float: left;
          // padding: 0 20px;
          padding-right: 30px;
.ivu-poptip-rel {
            a {
              color: #fff;
              font-size: 12px;
            }
            i.ivu-icon.ivu-icon-arrow-down-b {
              margin-left: 5px;
            }
          }
        }
.ios,
.andrio {
          float: left;
          text-align: center;
          img {
            width: 106px;
            height: 106px;
            margin: 0 auto;
          }
.tips {
            height: 30px;
            img {
              width: 14px;
              height: 14px;
              margin-top: 5px;
              margin-right: 5px;
            }
            span {
              font-size: 14px;
              // color: #000;
            }
          }
        }
.andrio {
          float: right;
        }
.ivu-dropdown-rel a {
          color: #fff;
        }
.ivu-select-dropdown {
          z-index: 901;
          #change_language_theme {
            li {
              background: #fff;
              color: #333;
            }
          }
        }
.changelanguage {
          float: left;
.languagelogo {
            float: left;
            padding-top: 5px;
            height: 45px;
            padding-left: 15px;
            margin-right: 12px;
          }
        }
      }
    }
.layout {
      background: #1a1a1a;
      // -moz-box-shadow:0px 2px 5px #f5f5f5;
      // -webkit-box-shadow:0px 2px 5px #f5f5f5;
      // box-shadow:0px 2px 5px #f5f5f5;
      // border-bottom: 1px solid #eee;
      width: 100%;
      z-index: 10;
      position: absolute;
      top: 0;
.layout-ceiling {
        padding: 5px 20px;
.layout-logo {
          width: 200px;
          height: 37px;
          background: url(./assets/images/logo.svg) no-repeat left center;
          background-size: contain;
          float: left;
          position: absolute;
        }
.layout-ceiling-main {

          height: 50px;
          line-height: 50px;
          margin-left: 218px;
.header_nav {
            display: none;
            li.ivu-menu-submenu.ivu-menu-item-active.ivu-menu-opened.ivu-menu-child-item-active {
              background: #1a1a1a;
.ivu-menu {
                a {
                  &:hover {
                    li {
                      background: none;
                      color: #c8c8c8;
                    }
                  }
                  li.ivu-menu-item.ivu-menu-item-active.ivu-menu-item-selected {
                    color: #c8c8c8;
                    border-bottom: 3px solid #d8d8d8;
                  }
                  li {
                    color: #8a8a8a;
                  }
                }
.router-link-exact-active.router-link-active {
                  li {
                    color: #c8c8c8;
                  }
                }
              }
            }
.ivu-menu-vertical.ivu-menu-light {
              &:after {
                width: 0;
              }
            }
          }
        }
.rr {
          display: none;
          z-index: 10;
          float:right;
.mymsg {
            float: left;
            padding-right: 20px;
            a {
              display: inline;
              padding-right: 20px;
              border-right: 1px solid #8a8a8a;
            }
            a:hover{
              color: #FFF;
            }
          }
.login_register {
            float: left;
            padding-right: 20px;
            border-right: 1px solid #292929;
            line-height: 50px;
.ivu-menu {
              background: transparent;
              #login,
              #register {
                display: inline-block;
                min-width: 60px;
                height: 100%;
                text-align: center;
                line-height: 20px;
                margin-left: 0px;
                box-sizing: border-box;
                li {
                  height: 100%;
                  color: #8a8a8a;
                }
                &:hover {
                  li {
                    color: #fff;
                  }
                }
              }
              #login{
                border-right: 1px solid #292929;
              }
              #register {
                color: #c8c8c8!important;
                &:hover {
                  li {
                    color: #fff;
                  }
                }
              }
            }
          }
.isLogin {
            a {
              color:#8a8a8a;
            }
            a:hover{
              color: #FFF;
            }
.ivu-dropdown {
              display: block;
              float: left;
.ivu-dropdown-rel {
                a {
                  margin-left: 0;
                }
              }
.ivu-select-dropdown {
                position: absolute;
              }
            }
          }
        }
.rightwrapper {
          display: none;
          float: right;
.appdownload {
            float: left;
            // padding: 0 20px;
            padding-right: 0px;
.ivu-poptip-rel {
              a {
                color: #8a8a8a;
              }
              i.ivu-icon.ivu-icon-arrow-down-b {
                margin-left: 5px;
              }
            }
          }
.ios,
.andrio {
            float: left;
            text-align: center;
            img {
              width: 106px;
              height: 106px;
              margin: 0 auto;
            }
.tips {
              height: 30px;
              img {
                width: 14px;
                height: 14px;
                margin-top: 5px;
                margin-right: 5px;
                border-radius: 3px;
              }
              span {
                font-size: 14px;
                // color: #000;
              }
            }
          }
.andrio {
            float: right;
          }
.ivu-dropdown-rel a {
            color: #fff;
          }
.ivu-select-dropdown {
            z-index: 901;
            #change_language_theme {
              li {
                background: #fff;
                color: #333;
              }
            }
          }
.changelanguage {
            float: left;
.languagelogo {
              float: left;
              padding-top: 5px;
              height: 45px;
              padding-left: 15px;
              margin-right: 12px;
            }
          }
        }
      }
    }
  }
.footer{
.footer_content{
.footer_right{
        display: none;
      }
    }
  }
}

.page-view3 {
  background: linear-gradient(150deg, #c3333d, #bc000d, #ff1d2c);;
  min-height: 100%;
  background-color: #FFF;
.page-content{
    padding-bottom: 20px!important;
.layout{
      display: none;
    }
.time_download{
      display: none;
    }
  }
.footer{
    display: none;
  }
}
.wechatclick.api2 {
  overflow: hidden;
  display: flex;
  justify-content: space-between;
  align-items: center;
  div {
    img {
      width: 100px;
    }
    span {
      display: block;
      color: #333;
      text-align: center;
    }
  }
}
.appdownload {
::v-deep.ivu-poptip-inner {
    background-color: #141414;
    color: #fff;
    padding-top: 10px;
  }
::v-deep.ivu-poptip-popper.ivu-poptip-arrow {
    border-bottom-color: #141414;
  }
::v-deep.ivu-poptip-popper.ivu-poptip-arrow:after {
    border-bottom-color: #141414;
  }
}
</style>

<style lang="scss">
.container_test {
  padding-top: 60px;
}

.ivu-table-filter-list.ivu-table-filter-select-item {
  color: #ccc;
  &:hover {
    background-color: #141414;
    color: #e2e2e2;
  }
}
.ivu-table-filter-list.ivu-table-filter-select-item-selected {
  color: #e2e2e2;
  &:hover {
    color: #e2e2e2;
  }
}

.ivu-table-filter i.on {
  color: #fff;
}
//tips
.ivu-message {
  color: #333;
}
.ivu-poptip-inner {
  background-color: #141414;
  color: #fff;
.ivu-poptip-body-content-inner {
    color: #fff;
  }
}
.ivu-poptip-popper {
  // border-top-color:#141414;
.ivu-poptip-arrow:after {
    left: 0!important;
    border-right-color: #141414!important;
  }
}
/* checkbox */
.exchange.ivu-checkbox-checked.ivu-checkbox-inner {
  background-color: #c8c8c8;
  border-color: #c8c8c8;
}
/* modal */
.ivu-modal-confirm-head {
  text-align: center;
  margin-bottom: 15px;
}
.ivu-modal-header p,
.ivu-modal-header-inner {
  color: #fff;
}
.ivu-modal-body {
  border-radius: 5px;
.ivu-modal-confirm {
.ivu-modal-confirm-body {
      font-size: 14px;
    }
  }
}
.ivu-modal-confirm-footer.ivu-btn-primary {
  background-color: #c8c8c8;
  border-color: #c8c8c8;
}
.ivu-modal-confirm-footer.ivu-btn-text {
  &:hover {
    color: #c8c8c8;
  }
}
.ivu-table-wrapper {
  background-color: #000000;
.ivu-table {
    box-shadow: 0px 0px 4px #141414;
    background-color: #000000;
    color: #ccc;
    &:before {
      background: transparent;
    }
    &:after {
      background: #000000;
    }
.ivu-table-header {
      th {
        background-color: #141414;
        border: none;
        color: #ccc;
      }
    }
.ivu-table-row:hover{
      background: #1c1c1c;
    }
.ivu-table-row td {
      background-color: transparent;
      border: none;
      border-bottom: 1px solid #141414;
      color: #fff;
    }
  }
}
.ivu-table td {
  background-color: #000000;
  border-bottom: 1px solid #141414;
}
.ivu-menu-light.ivu-menu-vertical.ivu-menu-item-active:not(.ivu-menu-submenu) {
  background: none;
  &:after {
    background: none;
  }
}
.ivu-select-dropdown.ivu-select-item {
  color: #ccc;
  padding: 6px 16px;
}

.page-view {
  height: 100%;
.page-content {
.layout {
.layout-ceiling {
        background: #1a1a1a;
        box-shadow: 0 0 5px 5px rgba(0,0,0,0.1);
.layout-ceiling-main {
.header_nav {
.ivu-menu-vertical.ivu-menu-light {
.ivu-menu-submenu-title {
                i.ivu-icon.ivu-icon-ios-arrow-down.ivu-menu-submenu-title-icon {
                  &:before {
                    content: "";
                  }
                }
              }
            }
          }
.rr {
.login_register.ivu-menu-submenu-title.ivu-icon {
              &:before {
                content: "";
              }
            }
          }
        }
      }
    }
  }
}
.page-view2 {
  height: 100%;
.page-content {
.layout {
.layout-ceiling {
.layout-ceiling-main {
.header_nav {
.ivu-menu-vertical.ivu-menu-light {
.ivu-menu-submenu-title {
                i.ivu-icon.ivu-icon-ios-arrow-down.ivu-menu-submenu-title-icon {
                  &:before {
                    content: "";
                  }
                }
              }
            }
          }
.rr {
.login_register.ivu-menu-submenu-title.ivu-icon {
              &:before {
                content: "";
              }
            }
          }
        }
      }
    }
  }
}
html,
body {
  height: 100%;
  font-size: 14px;
  background: #0e0e0e;
  color: #fff;
}

/* scrollbar */

::-webkit-scrollbar {
  width: 3px;
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #3b3b3b;
  border-radius: 25px;
}

.ivu-carousel-dots li button {
  width: 30px;
  height: 10px;
  border-radius: 14px;
}

.ivu-menu-dark,
.ivu-menu-dark.ivu-menu-vertical.ivu-menu-opened {
  background: #050505;
}

#checkbox {
  width: 10px;
}

//.login_right {
// position: absolute;
// background: #fff;
// width: 350px;
// height: 510px;
// top: 35px;
// right: 50px;
// }

.login_title {
  color: #000;
  text-align: center;
  height: 80px;
  font-size: 25px;
}
.login_right.ivu-select-dropdown {
  background: #fff;
}

.ivu-form-inline.ivu-form-item {
  display: block;
  margin-right: 0;
}

.layout {
  position: absolute;
}

.layout-copy {
  text-align: center;
  padding: 10px 0 20px;
  color: #9ea7b4;
}

.layout-ceiling-main {
  height: 50px;
  line-height: 50px;
  margin-left: 128px;
}

.layout-ceiling-main.rr {
  float: right;
}

.layout-ceiling-main.ivu-menu-vertical.ivu-menu-item,
.ivu-menu-vertical.ivu-menu-submenu-title {
  padding: 0;
}

.layout-ceiling-main.ivu-menu-item {
  font-size: 14px;
}

.layout-ceiling-main a {
  color: #fff;
  display: inline-block;
  line-height: 40px;
  height: 40px;
  text-align: center;
  margin-left: 20px;
  /*padding: 0 15px;*/
}

@media screen and (max-width:768px){
.header_nav{ display:none; }
.login-container{ display: none; }
.footer_right{display:none;}
.rightwrapper{display:none;}
}

.header_nav {
  float: left;
}

.ivu-dropdown-rel a {
  width: 100%;
}

.ivu-dropdown-menu {
  width: 120px;
}

.layout-ceiling-main.ivu-select-dropdown {
  background: #141414;
  margin-left: 25px;
.ivu-dropdown-item {
    padding: 10px 16px;
    color: #ccc;
    &:hover {
      color: #e2e2e2;
    }
  }
}

.ivu-select-dropdown a {
  width: 100%;
  text-align: left;
  margin: 0;
  height: 20px;
  line-height: 20px;
}

//.ivu-dropdown-item:hover {
// background: #141414;
// }

//.ivu-dropdown-item {
// color: #fff;
// }
.ivu-dropdown-item:hover {
  background-color: #141414;
  color: #e2e2e2;
}
.ivu-dropdown-item img {
  width: 14px;
  vertical-align: middle;
}

.ivu-radio-inner:after {
  background: #050505;
}

/* security centre */

.user_center {
  height: 900px;
}

.ivu-menu-item {
  text-align: center;
}

.ivu-menu-vertical.ivu-menu-submenu.ivu-menu-item {
  padding-left: 0!important;
  padding-right: 0;
  color: rgba(130,142,161,1);
  font-size: 14px;
  border-right: 0!important;
}

.ivu-menu-dark.ivu-menu-vertical.ivu-menu-submenu.ivu-menu-item-active,
.ivu-menu-dark.ivu-menu-vertical.ivu-menu-submenu.ivu-menu-item-active:hover {
  background: #3d3d3d!important;
}

.rr.ivu-menu-vertical.ivu-menu-light:after {
  width: 0;
}

.layout_menu_right {
  margin-left: 3%;
  background: #050505;
  color: #fff;
  padding-bottom: 130px;
}

.menu_right_title {
  font-size: 16px;
  line-height: 45px;
  margin: 0 10px;
  padding-left: 20px;
  border-bottom: 1px solid #222222;
}

.category.ivu-radio-group.ivu-radio-group-button {
  width: 100%;
}

.category.ivu-radio-group label {
  font-size: 14px;
}

.category.ivu-radio-group-button.ivu-radio-wrapper {
  background: #232323;
  color: #979797;
  border: 0;
  padding: 0 25px;
}

.category.ivu-radio-group-button.ivu-radio-wrapper-checked {
  color: #fff;
  background: #2b2b2b;
  box-shadow: none;
}

.category.ivu-radio-wrapper span {
  padding-left: 0;
}

.purse_address_left {
  float: left;
  width: 86%;
}

.purse_address p {
  font-size: 10px;
  line-height: 25px;
  color: #979797;
}

.purse_address_left_icon {
  line-height: 40px;
  height: 40px;
  width: 100%;
}

.purse_address_left_icon img {
  vertical-align: middle;
  margin-right: 10px;
}

.purse_address span {
  font-size: 14px;
  float: left;
  color: #fff;
  padding: 0 20px;
  background: #232323;
  width: 21%;
}

.purse_address_left_icon label {
  float: left;
  width: 72%;
  height: 40px;
  border: 2px solid #232323;
  padding-left: 20px;
}

#qrcode canvas {
  width: 120px;
}

#qrcode img {
  width: 100%;
}

.chart_container #chart_updated_time {
  float: left;
}

// layout
.page-content {
  min-height: 100%;
  padding-bottom: 200px;
}
/* B2: terminal routes reclaim the footer reserve so the desk can fill the viewport. */
.page-content.is-terminal {
  padding-bottom: 0;
  min-height: calc(100vh - 56px);
}

.footer {
  width: 100%;
  overflow: hidden;
  margin-top: -200px;
}
.footer_content {
  height: 300px;
  padding: 80px 10%;
  color: #53575c;
  color: rgba(255, 255, 255, 0.8);
  background: #000000;
}

.footer_left {
  float: left;
  font-size: 14px;
}

.footer_left img {
  margin: 15px 0;
  width: 300px;
}

.footer_left p {
  margin: 10px 0;
  color: #8a8a8a;
}

.footer_right {
  float: right;
  /*margin-top: 15px;*/
  text-align: left;
  /* margin-right: 20px; */
}

.footer_right ul {
  float: left;
  margin: 0 30px;
}
.footer_right ul li{
  list-style-type:none;
}
.footer_right ul li a {
  color: #8a8a8a;
  line-height: 30px;
  display: block;
  font-size: 12px;
}
.footer_right ul li a:hover{
  color: #FFFFFF;
}
.footer_title {
  font-size: 13px;
  height: 40px;
}
/* Honest-empty rows in the footer: readable, but visibly not a link, so a
   reader does not click hoping for an address that is not there. */
.footer-quiet {
  color: var(--ix-text-faint, #6b7280);
  font-size: 12px;
  line-height: 30px;
}

.ivu-select-selected-value {
  color: #bbbec4;
}

/*Fiat Trading*/

.ivu-col {
  text-align: center;
}

.page-view {
.page-content {
.layout {
.layout-ceiling {
.rr {
.login_register {
.ivu-menu-light.ivu-menu-vertical
.ivu-menu-item-active:not(.ivu-menu-submenu) {
              color: #fff;
            }
          }
.isLogin {
.ivu-dropdown {
              display: inline-block;
.ivu-select-dropdown {
                padding: 0;
                margin: 0;
.ivu-dropdown-menu {
.ivu-dropdown-item {
                    // background: #141414;
                    // color: #ccc;
                    border-radius: 5px;
                    // &:hover {
                    // background: #141414;
                    // color: #ccc;
                    // }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
.changelanguage {
.ivu-dropdown {
.ivu-select-dropdown {
      z-index: 901;
    }
  }
}
.ivu-page-next,
.ivu-page-prev {
  background-color: #000000;
}
.ivu-page-item {
  background-color: #000000;
  border-color: #141414;
}
.ivu-page-item-jump-next,
.ivu-page-item-jump-prev,
.ivu-page-next,
.ivu-page-prev {
  border-color: #141414;
}
.ivu-page-item-active {
  // background-color: #e2e2e2;
  // border-color: #e2e2e2;
  // color: #fff;
  font-weight:bold;
}
.ivu-page-next:hover,
.ivu-page-prev:hover {
  border-color: #e2e2e2;
}
.ivu-page-next:hover a,
.ivu-page-prev:hover a {
  color: #e2e2e2;
}

.ivu-page-item-jump-prev a,
.ivu-page-item-jump-next a {
  color: #666;
}
.ivu-page-item-jump-prev a:hover,
.ivu-page-item-jump-next a:hover {
  color: #e2e2e2;
}
.ivu-page-item:hover {
  border-color: #e2e2e2;
}
.ivu-page-item:hover a {
  color: #e2e2e2;
}
.ivu-page-item.ivu-page-item-active a {
  color: #e2e2e2;
}
.ivu-page-disabled {
  a {
    cursor: not-allowed;
.ivu-icon {
      cursor: not-allowed;
    }
  }
}
/* input reset */
.ivu-input,
.ivu-input-number-input,
.ivu-input-number {
  background-color: #000000;
  color: #fff;
  border-color: #141414;
  &:hover {
    border-color: #141414;
  }
  &:focus {
    border-color: #141414;
    box-shadow: none;
  }
}
.ivu-input[disabled]:hover,
fieldset[disabled].ivu-input:hover {
  border-color: #141414;
}
.ivu-input[disabled],
fieldset[disabled].ivu-input {
  background-color: #141414;
}
.ivu-input-number-focused {
  box-shadow: none;
}
.ivu-input-number:focus {
  box-shadow: none;
}
.ivu-form.ivu-form-item-label {
  color: #ccc;
}
.ivu-input-number-handler-wrap {
  background: #141414;
  border-left: 1px solid #000000;
}
.ivu-input-number-handler {
  border-top: 1px solid #000000;
}
.ivu-input-number-handler:hover.ivu-input-number-handler-up-inner,
.ivu-input-number-handler:hover.ivu-input-number-handler-down-inner {
  color: #ccc;
}
.ivu-input-group-append,
.ivu-input-group-prepend {
  color: #ccc;
}
/* select reset */
.ivu-select-selection {
  background-color: #000000;
  color: #fff;
  border: 1px solid #141414;
}
.ivu-select-selection:hover {
  border-color: #141414;
}
.ivu-select-visible.ivu-select-selection {
  border-color: #141414;
  box-shadow: none;
}
.ivu-select-selected-value {
  color: #fff;
}
.ivu-select-selection-focused {
  border-color: #141414;
}
.ivu-select-dropdown {
  background-color: #000000;
}

.ivu-select-disabled.ivu-select-selection {
  background-color: #141414;
}
.ivu-select-disabled.ivu-select-selection:hover {
  border-color: #141414;
}
/* select */
.ivu-select-item-selected {
  background-color: #000000;
  color: #ccc;
}
.ivu-select-item-focus {
  background-color: #000000;
}
.ivu-select-item:hover {
  background-color: #141414;
  // color:#ccc;
  color: #e2e2e2;
}
.ivu-select-multiple.ivu-select-item-selected {
  background-color: #000000;
  color: #e2e2e2;
}
.ivu-select-multiple.ivu-select-item-focus,
.ivu-select-multiple.ivu-select-item-selected:hover {
  background-color: #000000;
}
.ivu-select-multiple.ivu-select-item-selected:after {
  color: #e2e2e2;
}

.ivu-select-item-selected,
.ivu-select-item-selected:hover {
  background-color: #000000;
  color: #e2e2e2;
}
// chexkboxes
.ivu-checkbox-inner {
  background-color: #000000;
}

.ivu-switch {
  border: 1px solid #141414;
  background-color: #000000;
}
.ivu-switch:after {
  background-color: #ccc;
}
// tag
.ivu-tag {
  border: 1px solid #141414;
  border-radius: 3px;
  background: #000000;
}
.ivu-tag-text {
  color: #ccc;
}
/* table reset */
.ivu-table-wrapper {
  border: none;
}
.ivu-table-wrapper >.ivu-spin-fix {
  background-color: rgba(0, 0, 0, 0.2);
  border: none;
  border-color: #fff;
}
.ivu-spin-fix {
  background-color: rgba(0, 0, 0, 0.2);
  border: none;
  border-color: #fff;
}
/* loading reset */
.ivu-spin-dot {
  background: #e2e2e2;
}
.ivu-tabs-bar {
  border-color: #f5f5f5;
}
/* date picker reset */
.ivu-picker-panel-icon-btn {
  &:hover {
    color: #e2e2e2;
  }
}
.ivu-date-picker-focused input {
  border-color: #1d1d1d;
  box-shadow: none;
}
.ivu-date-picker-cells-focused em {
  // -moz-box-shadow: 0 0 0 1px #e2e2e2 inset;
  // -webkit-box-shadow: 0 0 0 1px #e2e2e2 inset;
  // box-shadow: 0 0 0 1px #e2e2e2 inset;
  box-shadow: none;
  color: #e2e2e2;
  &:after {
    // background: #141414;
  }
}
.ivu-date-picker-cells-cell {
  color: #fff;
}
.ivu-date-picker-cells-cell-selected em,
.ivu-date-picker-cells-cell-selected:hover em {
  background: #141414;
  color: #e2e2e2;
}
.ivu-date-picker-cells-cell-today em:after {
  background: #141414;
}
.ivu-date-picker-cells-cell-range:before {
  background: rgba(240, 167, 10, 0.2);
}
.ivu-date-picker-cells-cell:hover em {
  background: #141414;
  color: #e2e2e2;
}
/* button reset */

.ivu-btn {
  border: none;
}
.ivu-btn-primary:hover {
  background: #e2e2e2;
  border-color: #e2e2e2;
}
.ivu-btn.ivu-btn-default {
  background-color: #141414;
  color: #FFF;
  &:hover {
    color: #c8c8c8;
    // background: #141414;
    // border: 1px solid #c8c8c8;
  }
  &:active {
    color: #c8c8c8;
    // border: 1px solid #c8c8c8;
    // background: #141414;
  }
}
// primary
.ivu-btn-text {
  color: #ccc;
  border: 1px solid #141414;
}
.ivu-btn-primary {
  background-color: #e2e2e2;
  border-color: #e2e2e2;
}
.ivu-btn-text:hover {
  background-color: transparent;
  color: #e2e2e2;
}
.ivu-input-group-append,
.ivu-input-group-prepend {
  background-color: #141414;
  border: 1px solid #141414;
}
.ivu-form-item-error.ivu-input-group-append,
.ivu-form-item-error.ivu-input-group-prepend {
  background-color: #141414;
  border: 1px solid #141414;
}
.ivu-form-item-error.ivu-input,
.ivu-form-item-error.ivu-input:focus,
.ivu-form-item-error.ivu-input:hover {
  border: 1px solid #141414;
  box-shadow: none;
}

/* radio reset */
.ivu-radio-checked.ivu-radio-inner {
  border-color: #e2e2e2;
}
.ivu-radio-checked:hover {
.ivu-radio-inner {
    border-color: #e2e2e2;
  }
}
.ivu-radio-inner:after {
  background: #e2e2e2;
}
.ivu-switch-checked {
  border-color: #e2e2e2;
  background-color: #e2e2e2;
}
.ivu-switch:focus {
  box-shadow: none;
}
.ivu-radio-focus {
  box-shadow: none;
}

.ivu-modal-content {
  background-color: #000000;
}
.ivu-modal-header {
  border-bottom: 1px solid #141414;
}
.ivu-modal-confirm-head-icon-confirm {
  color: #fff;
}
.ivu-modal-header p {
  color: #fff;
}
.ivu-modal-footer {
  border-top: 1px solid #141414;
}
/* sort arrow reset */
.ivu-table-sort i.on {
  color: #e2e2e2;
}
.ivu-table-sort i:hover {
  color: #e2e2e2;
}
.ivu-modal-confirm-head-icon {
  font-size: 24px;
}
.ivu-modal-confirm-body {
  color: #fff;
  padding-left: 0;
}
.ivu-modal-confirm-head-title {
  color: #fff;
  margin-left: 5px;
}
.ivu-modal-confirm-footer {
  padding-top: 10px;
  border-top: 1px solid #141414;
}
.ivu-upload-list-file:hover {
  background-color: #141414;
}

.ivu-menu-light.ivu-menu-horizontal.ivu-menu-item-active,.ivu-menu-light.ivu-menu-horizontal.ivu-menu-item:hover,.ivu-menu-light.ivu-menu-horizontal.ivu-menu-submenu-active,.ivu-menu-light.ivu-menu-horizontal.ivu-menu-submenu:hover{
  border-bottom:0!important;
  color: #8a8a8a!important;
}
.ivu-menu-horizontal.ivu-menu-submenu.ivu-select-dropdown.ivu-menu-item:hover{
  background: #2b2b2b!important;
}
.ivu-menu-horizontal.ivu-menu-light{
  background:transparent!important;
}
.ivu-menu-horizontal.ivu-menu-light:after{
  height: 0!important;
}
.ivu-select-dropdown{
  border-radius: 0!important;
}
.lang-img{
    height: 20px;
    margin-bottom: -5px;
    margin-right: 5px;
}
.lang-item{
  text-align:left;
  img{
    height: 20px;
    margin-bottom: -5px;
    margin-right: 5px;
  }
  &:hover{
    background:#2b2b2b;
  }
}
.ivu-message-notice-content{
  background: #303030;
  color: #a3bbcc;
}

.social-list{
  ul{
    list-style: none;
    padding-top: 5px;
    li{
      transition: all 0.5s;
      width: 25px;height:25px;line-height:25px;border-radius:2px;background:rgb(57, 69, 89);text-align:center;float: left;margin-right:8px;color:#a3b6c6;
      &:hover{
        color: #FFF;
        cursor: pointer;
      }
    }
  }
}
.ivu-tooltip-inner{
  background: #313131;
}
.ivu-tooltip-arrow{
  border-bottom-color: #313131;
}
.ivu-notice-notice{
  background: #252525;
}
.ivu-notice-title{
  color: #FFFFFF;
}
.ivu-notice-desc{
  color: #FFFFFF;
}
.swiper-pagination-fraction,.swiper-pagination-custom,.swiper-container-horizontal >.swiper-pagination-bullets{
  bottom: -5px;
}
.swiper-pagination-bullet{
  background: #FFF;
  border-radius: 2px;
  height: 3px;
  width: 15px;
  opacity: 0.3;
  transition: all 0.5s;
}
.swiper-pagination-bullet-active{
  background: #c8c8c8!important;
  width:30px;
  opacity: 1;
}
.login_right.ivu-select-dropdown{
  background: #1e1e1e;
}
.login_right.ivu-select-dropdown.ivu-select-item{
  text-align: left;
}
.ivu-form-item-error.ivu-input-group-append,.ivu-form-item-error.ivu-input-group-prepend,.ivu-input-group-append,.ivu-input-group-prepend{
  background-color: #171717;
  border-bottom: 1px solid #141414;
  border-top:none;
  border-left: none;
  border-right: none;
}
.ivu-select-single.ivu-select-selection{
  background-color: #171717;
}
.login_form{
  /* WebKit browsers */
  input::-webkit-input-placeholder {
    color: #8a8a8acf!important;
    font-size: 0.95rem!important;
    letter-spacing: 1px!important;
  }
  /* Mozilla Firefox 4 to 18 */
  input:-moz-placeholder {
    color: #8a8a8a!important;
    font-size: 13px!important;
    letter-spacing: 1px!important;
  }
  /* Mozilla Firefox 19+ */
  input::-moz-placeholder {
    color: #8a8a8a!important;
    font-size: 13px!important;
    letter-spacing: 1px!important;
  }
  /* Internet Explorer 10+ */
  input::-ms-input-placeholder {
    color: #8a8a8a!important;
    font-size: 13px!important;
    letter-spacing: 1px!important;
  }

.ivu-input-group-prepend{
    font-size: 0.95rem;
    letter-spacing: 1px;
  }
}

.login_form.login_right form.ivu-form.ivu-form-label-right.ivu-form-inline.password.ivu-form-item-content.ivu-input-wrapper.ivu-input-type.ivu-input{
  letter-spacing: 8px;
}

.ivu-menu-light{
  background: transparent!important;
}


.ivu-spin-fullscreen-wrapper{
      background: #46597a70!important;
}

.ivu-spin{
  color:#c8c8c8!important;
}
.ivu-poptip-popper[x-placement^=bottom].ivu-poptip-arrow{
  border-bottom-color: #141414;
}
.ivu-poptip-popper[x-placement^=bottom].ivu-poptip-arrow:after{
  border-bottom-color: #141414;
}

.ivu-poptip-title-inner {
    color: #CCC;
    font-size: 14px;
}
.ivu-poptip-title:after {
    background-color: #2f2f2f;
}
.tag-hot{
    display: inline-block;
    padding: 0 4px;
    background: #FF0000;
    color: #FFF;
    line-height: 16px;
    font-size: 10px;
    margin-left: 5px;
    margin-top: -5px;
    border-radius: 2px;
    position: absolute;
    top: 16px;
    font-weight: 600;
}
.page{
  text-align:right;
  margin-top: 10px;
.ivu-page{
.ivu-page-prev,.ivu-page-next{
      background: transparent!important;
      color: #000;
      border: none;
    }
.ivu-page-item{
      background-color: transparent!important;
      color: #000;
      border: none;
    }
  }
}
.ivu-progress-bg{
  border-radius: 0!important;
  background-color: #d0d0d0;
  max-width: 100%;
}
.ivu-progress-success.ivu-progress-bg{
  background-color: #d0d0d0!important;
}
.header_nav_mobile.ivu-menu-vertical.ivu-menu-item,.header_nav_mobile.ivu-menu-vertical.ivu-menu-submenu-title{
  padding: 8px 24px 8px 5px;
  color: #8a8a8a;
}
.header_nav_mobile.ivu-drawer-wrap.ivu-drawer-no-header.ivu-drawer-content.ivu-drawer-body{
  background: #2b323a;
  padding-top: 60px;
}
.header_nav_mobile.ivu-menu-vertical.ivu-menu-light:after{
  background:transparent!important;
}
.header_nav_mobile.ivu-menu-light.ivu-menu-vertical.ivu-menu-item-active:not(.ivu-menu-submenu){
  color: #c8c8c8;
}
</style>
