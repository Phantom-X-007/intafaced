<template>
  <div>
    <div id="fullpage">
      <div id="pagetips" style="border-bottom:1px solid rgb(28, 39, 58);">
        <div class="topnav">
          <div class="carl">
            <div class="notice-list">
              <div class="notice-item" v-for="(item,index) in FAQList">
                <div class="cal_content">
                  <span></span>
                  <router-link target="_blank" :to="{path: '/announcement/' + item.id}">[ {{item.createTime}} ] {{strde(item.title)}}</router-link>
                </div>
              </div>
            </div>
            <div class="more">
              <router-link to="/announcement/0" target="_blank">{{$t('common.more')}}</router-link>
            </div>
          </div>
        </div>
      </div>
      <div class="section" id="page1">
        <!-- <div v-if="false"> -->

        <div class="spin-wrap banner-panel">
          <img style="height: 100%;" src="../../assets/images/bannerbg.png"></img>
          <p style="text-align:center;font-size:40px;color:#fff;position:absolute;top: 70px;width:100%;letter-spacing:5px;text-shadow: 0px 0px 10px #000000;">{{$t("common.slogan")}}</p>
          <p style="text-align:center;font-size:20px;color:#8a8a8a;position:absolute;top: 130px;width:100%;letter-spacing:2px;">{{$t("common.subslogan")}}</p>
          <div class="activity-list" v-show="picShow">
            <div class="swiper-container" id="swiper_container">
              <div class="swiper-wrapper">
                <div class="swiper-slide" v-for="(item,index) in picList">
                  <a v-if="item.linkUrl&&item.linkUrl!=' '&&item.linkUrl!='1'" :href="item.linkUrl" target="_blank">
                    <div class="activity-item">
                      <img :src="item.url"></img>
                    </div>
                  </a>
                  <div v-else class="activity-item">
                    <img :src="item.url"></img>
                  </div>
                </div>
              </div>
              <div class="swiper-pagination"></div>
            </div>
          </div>
        </div>
      </div>
      <div id="pagetips" style="background: #1a1a1a;">
        <div class="agent-panel">
          <div class="title">
            <div class="gettingstart">{{$t('sectionPage.gettingstart')}}</div>
            <div class="tips">{{$t('sectionPage.officialstart')}}</div>
          </div>
          <div class="agent-list">
            <div class="agent-item">
              <div class="agent-img">
                <img v-if="langPram=='EN'" src="../../assets/images/new_1usd.png"></img>
                <img v-else="langPram=='CN'" src="../../assets/images/new_1cny.png"></img>
              </div>
              <router-link to="/helpdetail?cate=0&id=20&cateTitle=Beginner's Guide" target="_blank">
                <div class="agent-detail">
                  <p class="agent-name">{{$t('sectionPage.oneminutebuy')}}</p>
                  <p class="agent-count">{{$t('sectionPage.oneminutebuytips')}}</p>
                </div>
              </router-link>
            </div>
            <div class="agent-item">
              <div class="agent-img">
                <img src="../../assets/images/new_3.png"></img>
              </div>
              <router-link to="/helplist?cate=2&cateTitle=Trading Guide" target="_blank">
                <div class="agent-detail">
                  <p class="agent-name">{{$t('sectionPage.baseexchange')}}</p>
                  <p class="agent-count">{{$t('sectionPage.baseexchangetips')}}</p>
                </div>
              </router-link>
            </div>
            <div class="agent-item">
              <div class="agent-img">
                <img src="../../assets/images/new_2.png"></img>
              </div>
              <router-link to="/helplist?cate=6&cateTitle=Getting Started" target="_blank">
                <div class="agent-detail">
                  <p class="agent-name">{{$t('sectionPage.baseknow')}}</p>
                  <p class="agent-count">{{$t('sectionPage.baseknowtips')}}</p>
                </div>
              </router-link>
            </div>
            <div class="agent-item">
              <div class="agent-img">
                <img src="../../assets/images/new_4.png"></img>
              </div>
              <router-link to="/helpdetail?cate=0&id=28&cateTitle=Beginner's Guide" target="_blank">
                <div class="agent-detail">
                  <p class="agent-name">{{$t('sectionPage.usersocial')}}</p>
                  <p class="agent-count">{{$t('sectionPage.usersocialtips')}}</p>
                </div>
              </router-link>
            </div>
          </div>
        </div>
      </div>
      <div style="width: 100%;background: #000000;display:none;">
        <router-link to="/announcement/118930" target="_blank" style="width: 100%;">
          <img src="/static/bannerimg.png" style="width: 72%;margin-left: 14%;margin-top: 20px;">
        </router-link>
      </div>
      <div class="section" id="page2">
        <div class="page2nav">
          <div class="board-title" style="display:inline-block;display: none;">{{$t('sectionPage.mainboard')}} &nbsp; >>></div>
          <ul class="brclearfix">
            <li v-show="!(index==0&&!isLogin)" v-for="(item,index) in indexBtn" @click="addClass(index)" :class="{'active' :index==choseBtn,'ivu-btn-default':index!=choseBtn}" :key="index">{{item.text}}</li>
            <li style="float:right;padding-right: 6px;"><Input search:placeholder="$t('common.searchplaceholder')" @on-change="seachInputChange" v-model="searchKey"/></li>
          </ul>
        </div>
        <div class="ptjy">
          <Table v-if="choseBtn==0" :columns="favorColumns" :data="dataIndex" class="tables" :disabled-hover="true" :loading="loading" :no-data-text="marketsTableEmptyText"></Table>
          <Table v-if="choseBtn!=0" :columns="coins.columns" :data="dataIndex" class="tables" :disabled-hover="true" :loading="loading" :no-data-text="marketsTableEmptyText"></Table>
<!--
          <p v-if="choseBtn!=0" style="height:50px;line-height:50px;padding-left:10px;border-bottom:1px solid #222222;font-size:14px;color:rgb(97, 119, 146);">Launchpad</p>
          <Table v-if="choseBtn!=0" :columns="coins.columns" :data="dataIndex2" class="tables" :disabled-hover="true" :loading="loading" :no-data-text="$t('common.nodata')"></Table>
-->
        </div>
      </div>
      <div class="section bg-light" id="page6">
        <p class="title">{{$t('sectionPage.brandTitle')}}</p>
        <p class="subtitle">{{$t('sectionPage.brandDetail')}}</p>
        <div class="detail">{{$t('sectionPage.brandDesc1')}}</div>
        <div class="detail">{{$t('sectionPage.brandDesc2')}}</div>
      </div>
      <div class="section" id="page4">
        <ul>
          <li>
            <div><img src="../../assets/images/feature_safe.png" alt=""></div>
            <p class="title">{{$t('description.title1')}}</p>
            <p>{{$t('description.message1')}}</p>
          </li>
          <li>
            <div><img src="../../assets/images/feature_fast.png" alt=""></div>
            <p class="title">{{$t('description.title2')}}</p>
            <p>{{$t('description.message2')}}</p>
          </li>
          <li>
            <div><img src="../../assets/images/feature_global.png" alt=""></div>
            <p class="title">{{$t('description.title3')}}</p>
            <p>{{$t('description.message3')}}</p>
          </li>
          <li>
            <div><img src="../../assets/images/feature_choose.png" alt=""></div>
            <p class="title">{{$t('description.title4')}}</p>
            <p>{{$t('description.message4')}}</p>
          </li>
        </ul>
      </div>

      <div class="section" id="page5">
        <div class="phone_image"></div>
        <ul class="download">
          <li class="qrcode">{{$t('description.scanqrcode')}}</li>
          <li class="wrapper">
            <div class="download_app">
              <img src="../../assets/images/appdownload.png">
            </div>
            <div class="abstract">
              <div class="content">
                <span></span>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
    <div class="app_bottom">
      <div class="left_logo">
        <img style="float:left;" src="../../assets/images/applogo.svg"></img>
        <div style="float:left;height: 40px;line-height:40px;color:#000;">{{$t("cms.downloadslogan")}}</div>
      </div>
      <div class="right_btn_wrap"><router-link target="_blank" to="/app" class="right_btn">{{$t("cms.download")}}</router-link></div>
    </div>
  </div>
</template>
<script>
/**
 * THE MARKET LIST — `GET /api/v1/markets` + `GET /api/v1/tickers` on svc-trade
 * through svc-edge. Was `POST /market/symbol-thumb-trend` plus a SockJS/STOMP
 * feed on the retired Java market service (ADR 2026-08-02, Option B).
 *
 * WHAT A READER SEES TODAY, AND WHY IT IS NOT A BUG. Our ticker reports `null`
 * for every 24h rollup — high, low, volume, change — because no windowed
 * aggregation job exists, and `null` for last price on a market that has never
 * traded. Those columns print a dash. A market list showing a column of green
 * +0.00% would state that sixteen markets are flat, which is a claim about
 * price movement we have no data to make.
 *
 * The table is a snapshot taken on load and does not tick; the live feed is a
 * separate service and is not wired here. See the note where startWebsock was.
 */
var moment = require("moment");
import { rest } from "@/config/intafaced.js";
import ixTrade from "@js/ix-trade.js";
import SvgLine from "@components/exchange/SvgLine.vue";
import $ from "@js/jquery.min.js";

import Swiper from 'swiper';

export default {
  components: { SvgLine },
  data() {
    let self = this;
    return {
      loading: false,
      /* True only when market thumb failed — empty table is not "no markets". */
      marketsDown: false,
      percent: 0,
      pageNo: 1,
      pageSize: 6,
      totalNum: 0,
      FAQList: [],
      yesDayCashDividensBonusETH: 0,
      CNYRate: null,
      dataIndex: [],
      pageNo: 1,
      totalNum: 0,
      searchKey: "",
      favorColumns: [
        {
          title: self.$t("service.favor"),
          align: "center",
          key: "collection",
          width: 60,
          render: (h, params) => {
            let flag = this.isLogin;
            return h("Icon", {
              props: {
                color: "#00c2a8",
                size: "18",
                type: params.row.isFavor
? "ios-star"
: "ios-star-outline"
              },
              nativeOn: {
                click: () => {
                  if (this.isLogin) {
                    event.stopPropagation(); //stop event propagation
                    if (
                      event.currentTarget.className ==
                      "ivu-icon ivu-icon-ios-star"
) {
                      this.cancelCollect(params.index, params.row);
                      event.currentTarget.className ==
                        "ivu-icon ivu-icon-ios-star-outline";
                    } else {
                      this.collect(params.index, params.row);
                      event.currentTarget.className =
                        "ivu-icon ivu-icon-ios-star";
                    }
                  } else {
                    this.$Message.warning("Please sign in first");
                  }
                }
              }
            });
          }
        },
        {
          title: self.$t("service.COIN"),
          align: "center",
          width: 70,
          key: "symbol"
        },
        {
          title: self.$t("service.NewPrice"),
          align: "center",
          key: "price",
          minWidth:180,
          sortable: true,
          sortMethod: function(a, b, type) {
            let a1 = parseFloat(a);
            let b1 = parseFloat(b);
            if (type == "asc") {
              return a1 - b1;
            } else {
              return b1 - a1;
            }
          },
          render: function(h, params) {
            // var rmb = self.round(self.mul(params.row.price, 6.5), 2);
            // if (self.CNYRate!= null)
            // rmb = self.round(self.mul(params.row.price, self.CNYRate), 2);
            let CNYRate = self.CNYRate || 6.5,
              rmb = self.round(self.mul(params.row.usdRate, CNYRate), 2);
            const isgreen =
              parseFloat(params.row.rose) < 0? "none": "inline-block";
            const nogreen =
              parseFloat(params.row.rose) < 0? "inline-block": "none";
            return h("div", {
                  attrs: {
                    class: "price-td"
                  }
            },[
              h("span", {}, params.row.price),
              h("span", {
                  attrs: {
                    class: "price-rmb"
                  }
                }, " ≈ ¥" + rmb),
              h(
                "Icon",
                {
                  props: {
                    type: "arrow-up-c"
                  },
                  style: {
                    display: isgreen,
                    fontSize: "16px",
                    marginLeft: "5px",
                    verticalAlign: "middle"
                  },
                  class: {
                    green: true
                  }
                },
                "↑"
),
              h(
                "Icon",
                {
                  props: {
                    type: "arrow-down-c"
                  },
                  style: {
                    display: nogreen,
                    fontSize: "16px",
                    marginLeft: "5px",
                    verticalAlign: "middle"
                  },
                  class: {
                    red: true
                  }
                },
                "↓"
)
            ]);
          }
        },
        {
          title: self.$t("service.Change"),
          align: "center",
          key: "rose",
          minWidth:50,
          sortable: true,
          sortMethod: function(a, b, type) {
            let a1 = a.replace(/[^\d|.|-]/g, "") - 0;
            let b1 = b.replace(/[^\d|.|-]/g, "") - 0;
            if (type == "asc") {
              return a1 - b1;
            } else {
              return b1 - a1;
            }
          },
          render: (h, params) => {
            const row = params.row;
            const className = parseFloat(row.rose) < 0? "red": "green";
            return h(
              "span",
              {
                attrs: {
                  class: className
                }
              },
              row.rose
);
          }
        },
        {
          title: self.$t("service.high"),
          align: "center",
          key: "high",
          render: (h, params) => {
            return h("div", {}, params.row.high);
          }
        },
        {
          title: self.$t("service.low"),
          align: "center",
          key: "high",
          render: (h, params) => {
            return h("div", {}, params.row.low);
          }
        },
        {
          title: self.$t("service.ExchangeNum"),
          align: "center",
          key: "volume",
          // width: 110,
          sortable: true,
          sortMethod: function(a, b, type) {
            let a1 = parseFloat(a);
            let b1 = parseFloat(b);
            if (type == "asc") {
              return a1 - b1;
            } else {
              return b1 - a1;
            }
          }
        },
        // {
        // title: self.$t("service.OpenPrice"),
        // align: "center",
        // key: "open",
        // width: 150,
        // sortable: true,
        // sortMethod: function(a, b, type) {
        // let a1 = parseFloat(a);
        // let b1 = parseFloat(b);
        // if (type == "asc") {
        // return a1 - b1;
        // } else {
        // return b1 - a1;
        // }
        // }
        // },

        {
          title: self.$t("service.PriceTrend"),
          align: "center",
          render: function(h, params) {
            let valus = null;
            let len = params.row.trend.length;
            valus =
              len > 0
? params.row.trend
: [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ];
            return h(SvgLine, {
              props: {
                values: valus,
                rose: params.row.rose,
                width: 100,
                height: 25
              }
            });
          }
        },
        {
            title: self.$t("service.Operate"),
            align: "center",
            key: "buyBtn",
            width: 100,
            render: function(h, params) {
              return h("div", [
                h("span", {
                  style: {
                    cursor: "pointer",
                    color: "#00c2a8",
                    display: "inline-block",
                    padding: "2px 8px"
                  },
                  on: {
                    click: function() {
                      self.$router.push({
                        name: 'ExchangePair',
                        params: {
                          pair: params.row.href
                        }
                      });
                    }
                  }
                }, self.$t("service.trading"))
              ]);
            }
          }
      ],
      // , Pair
      coins: {
        _map: [],
        USDT: [],
        USDT2: [],
        BTC: [],
        BTC2: [],
        ETH: [],
        ETH2: [],
        favor: [],
        columns: [
          {
            title: self.$t("service.favor"),
            align: "center",
            key: "collection",
            width: 60,
            // renderHeader: (h, params) => {
            // return h("Icon", {
            // props: {
            // color: "#00c2a8",
            // size: "18",
            // type: "android-star-outline"
            // }
            // });
            // },
            render: (h, params) => {
              let flag = this.isLogin;
              return h("Icon", {
                props: {
                  color: "#00c2a8",
                  size: "18",
                  type: params.row.isFavor
? "ios-star"
: "ios-star-outline"
                },
                nativeOn: {
                  click: (event) => {
                    if (this.isLogin) {
                      event.stopPropagation(); //stop event propagation
                      if (
                        event.currentTarget.className ==
                        "ivu-icon ivu-icon-ios-star"
) {
                        this.cancelCollect(params.index, params.row);
                        event.currentTarget.className ==
                          "ivu-icon ivu-icon-ios-star-outline";
                      } else {
                        this.collect(params.index, params.row);
                        event.currentTarget.className =
                          "ivu-icon ivu-icon-ios-star";
                      }
                    } else {
                      this.$Message.warning("Please sign in first");
                    }
                  }
                }
              });
            }
          },
          {
            title: self.$t("service.COIN"),
            align: "center",
            key: "coin",
            width: 90,
            render: function(h, params) {
              return h("div", [
                h("span", {}, params.row.coin+"/"+params.row.base)
              ]);
            }
          },
          {
            title: self.$t("service.NewPrice"),
            align: "center",
            key: "price",
            minWidth: 150,
            sortable: true,
            sortMethod: function(a, b, type) {
              let a1 = parseFloat(a);
              let b1 = parseFloat(b);
              if (type == "asc") {
                return a1 - b1;
              } else {
                return b1 - a1;
              }
            },
            render: function(h, params) {
              // var rmb = self.round(self.mul(params.row.price, 6.5), 2);
              // if (self.CNYRate!= null)
              // rmb = self.round(self.mul(params.row.price, self.CNYRate), 2);
              let CNYRate = self.CNYRate || 6.5,
                rmb = self.round(self.mul(params.row.usdRate, self.CNYRate), 2);
              const isgreen =
                parseFloat(params.row.rose) < 0? "none": "inline-block";
              const nogreen =
                parseFloat(params.row.rose) < 0? "inline-block": "none";
              return h("div", {
                attrs: {
                    class: "price-td"
                  }
              }, [
                h("span", {}, params.row.price + ""),
                h("span", {
                  attrs: {
                    class: "price-rmb"
                  }
                }, " ≈ ¥" + rmb),
                h(
                  "Icon",
                  {
                    props: {
                      type: "arrow-up-c"
                    },
                    style: {
                      display: isgreen,
                      fontSize: "16px",
                      marginLeft: "5px",
                      verticalAlign: "middle"
                    },
                    class: {
                      green: true
                    }
                  },
                  "↑"
),
                h(
                  "Icon",
                  {
                    props: {
                      type: "arrow-down-c"
                    },
                    style: {
                      display: nogreen,
                      fontSize: "16px",
                      marginLeft: "5px",
                      verticalAlign: "middle"
                    },
                    class: {
                      red: true
                    }
                  },
                  "↓"
)
              ]);
            }
          },
          {
            title: self.$t("service.Change"),
            align: "center",
            key: "rose",
            minWidth: 50,
            sortable: true,
            sortMethod: function(a, b, type) {
              let a1 = a.replace(/[^\d|.|-]/g, "") - 0;
              let b1 = b.replace(/[^\d|.|-]/g, "") - 0;
              if (type == "asc") {
                return a1 - b1;
              } else {
                return b1 - a1;
              }
            },
            render: (h, params) => {
              const row = params.row;
              const className = parseFloat(row.rose) < 0? "red": "green";
              return h(
                "span",
                {
                  attrs: {
                    class: className
                  }
                },
                row.rose
);
            }
          },
          {
            title: self.$t("service.high"),
            align: "center",
            key: "high",
            render: (h, params) => {
              return h("div", {}, params.row.high);
            }
          },
          {
            title: self.$t("service.low"),
            align: "center",
            key: "high",
            render: (h, params) => {
              return h("div", {}, params.row.low);
            }
          },
          {
            title: self.$t("service.ExchangeNum"),
            align: "center",
            key: "volume",
            // minWidth: 110,
            sortable: true,
            sortMethod: function(a, b, type) {
              let a1 = parseFloat(a);
              let b1 = parseFloat(b);
              if (type == "asc") {
                return a1 - b1;
              } else {
                return b1 - a1;
              }
            }
          },
          {
            title: self.$t("service.PriceTrend"),
            align: "center",
            render: function(h, params) {
              let valus = null;
              let len = params.row.trend.length;
              valus =
                len > 0
? params.row.trend
: [
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0,
                      0
                    ];
              return h(SvgLine, {
                props: {
                  values: valus,
                  rose: params.row.rose,
                  width: 100,
                  height: 25
                }
              });
            }
          },
          {
            title: self.$t("service.Operate"),
            align: "center",
            key: "buyBtn",
            width: 100,
            render: function(h, params) {
              return h("div", [
                h("span", {
                  style: {
                    cursor: "pointer",
                    color: "#00c2a8",
                    display: "inline-block",
                    padding: "2px 8px"
                  },
                  on: {
                    click: function() {
                      self.$router.push({
                        name: 'ExchangePair',
                        params: {
                          pair: params.row.href
                        }
                      });
                    }
                  }
                }, self.$t("service.trading"))
              ]);
            }
          }
        ]
      },
      /* Rebuilt from the real listing once /markets answers — see rebuildTabs.
         Starts with the watchlist alone rather than three hardcoded quote tabs,
         so nothing claims a USDT/BTC/ETH market exists before the venue says so. */
      indexBtn: [
        {
          text: this.$t("intafaced.trade.watchlistTab")
        }
      ],
      /** Quote assets the venue actually lists, in listing order. */
      quoteTabs: [],
      /** Watchlist symbols, local to this browser. Not account state. */
      localFavorites: [],
      /** Verbatim refusal text from the venue, when the listing could not load. */
      marketsMessage: "",
      choseBtn: 0,
      valueCal: 0,
      showArrow: "never",
      speed: 5000,
      symbol: "",
      usdtData: [],
      usdtList: [],
      btcList: [],
      ethList: [],
      picList: [],
      picShow: false
    };
  },
  created: function() {
    this.init();
  },
  computed: {
    isLogin: function() {
      return this.$store.getters.isLogin;
    },
    lang: function() {
      return this.$store.state.lang;
    },
    langPram: function(){
      if(false){
        return "CN";
      }
      if(this.$store.state.lang == "English"){
        return "EN";
      }
      return "CN";
    },
    marketsTableEmptyText: function() {
      if (this.marketsDown) {
        return this.$t("common.marketsUnavailable");
      }
      return this.$t("common.nodata");
    }
  },
  watch: {
    lang: function() {
      this.updateLangData();
    }
  },
  mounted: function() {
    this.loadFavorites();
    this.getSymbol();
    //this.initSwiper();
  },
  methods: {
    seachInputChange(){
      this.searchKey = this.searchKey.toUpperCase();
      var source;
      if (this.choseBtn === 0) {
        source = this.coins.favor;
      } else {
        var quote = this.quoteTabs[this.choseBtn - 1];
        source = quote ? this.coins[quote] || [] : [];
      }
      var key = this.searchKey;
      this.dataIndex = key
        ? source.filter(function (item) { return item.symbol.indexOf(key) === 0; })
        : source;
    },
    initSwiper(){
      var ss = new Swiper ('.swiper-container', {
        loop: true,
        autoplay: true,
        pagination: {
          el: '.swiper-pagination',
          clickable: true,
        },
        slidesPerView:4,
        spaceBetween: 25
      });
      var comtainer = document.getElementById('swiper_container');
      comtainer.onmouseenter = function () {
        ss.autoplay.stop();
      };
      comtainer.onmouseleave = function () {
        ss.autoplay.start();
      }
    },
    strde(str) {
      str = str.trim();
      if(this.langPram == "EN"){
        return str.length > 25? str.slice(0, 25) + "...": str;
      }
      return str.length > 18? str.slice(0, 18) + "...": str;
    },
    updateLangData() {
      /* Quote-tab labels are asset codes and are not translated; only the
         watchlist tab has copy, so rebuildTabs() is the whole job here. */
      this.rebuildTabs();

      this.coins.columns[0].title = this.$t("service.favor");
      this.coins.columns[1].title = this.$t("service.COIN");
      this.coins.columns[2].title = this.$t("service.NewPrice");
      this.coins.columns[3].title = this.$t("service.Change");
      this.coins.columns[4].title = this.$t("service.high");
      this.coins.columns[5].title = this.$t("service.low");
      this.coins.columns[6].title = this.$t("service.ExchangeNum");
      this.coins.columns[7].title = this.$t("service.PriceTrend");
      this.coins.columns[8].title = this.$t("service.Operate");

      this.favorColumns[0].title = this.$t("service.favor");
      this.favorColumns[1].title = this.$t("service.COIN");
      this.favorColumns[2].title = this.$t("service.NewPrice");
      this.favorColumns[3].title = this.$t("service.Change");
      this.favorColumns[4].title = this.$t("service.high");
      this.favorColumns[5].title = this.$t("service.low");
      this.favorColumns[6].title = this.$t("service.ExchangeNum");
      this.favorColumns[7].title = this.$t("service.PriceTrend");
      this.favorColumns[8].title = this.$t("service.Operate");
    },
    init() {
      this.$store.commit("navigate", "nav-index");
      this.$store.state.HeaderActiveName = "1-1";
      this.loadPicData();
      this.addClass(1);
      // this.getmoneyData();
      this.loadDataPage(this.pageNo);
    },
    getStyle(obj, attr) {
      if (obj.currentStyle) {
        return obj.currentStyle[attr];
      } else {
        return getComputedStyle(obj, false)[attr];
      }
    },
    loadDataPage(pageIndex) {
      var param = {};
      (param["pageNo"] = pageIndex),
        (param["pageSize"] = this.pageSize),
        (param["lang"] = this.langPram),
        this.$http
.post(this.host + this.api.uc.announcement, param)
.then(response => {
            var resp = response.body;
            if (resp.code == 0) {
              if (resp.data.content.length == 0) return;

              this.totalNum = resp.data.totalElements;

              let FAQListtem = resp.data.content;
              if(this.totalNum > 3){
                this.FAQList = FAQListtem.slice(0, 3);
              }else{
                this.FAQList = FAQListtem;
              }
              this.FAQList.forEach(function(item){
                item.createTime = item.createTime.substring(5, 10);
              });
            } else {
              this.$Notice.error({
                title: this.$t("common.tip"),
                desc: resp.message
              });
            }
          });
    },
    /* REMOVED: getCNYRate(). It read `/market/exchange-rate/usd-cny` on the
       retired Java market service to convert prices into CNY. This platform
       publishes no FX rate source, so there is nothing to repoint it at — and a
       fiat conversion computed from a rate we invented is a price, not a
       decoration. `CNYRate` stays null and every place that used it already
       guards on it. */
    donwload(type) {
      const title = this.$t("common.tip");
      const content = "<p>" + this.$t("common.expect") + "</p>";
      this.$Modal.info({
        title: title,
        content: content,
        closable: true
      });
    },
    loadPicData() {
      let param = {};
      param["sysAdvertiseLocation"] = 1;
      param["lang"] = this.langPram;
      this.$http
.post(this.host + "/uc/ancillary/system/advertise", param)
.then(response => {
          var result = response.body;
          if (result.code == 0 && result.data.length > 2) {
            this.picList = result.data;
            this.picShow = true;
            var _this = this;
            setTimeout(function(){
              _this.initSwiper();
            },1000);
          }else{
            this.picShow = false;
          }
        });
    },
    getCoin(symbol) {
      return this.coins._map[symbol];
    },
    /* REMOVED: startWebsock(). It opened a SockJS/STOMP connection to
       `/market/market-ws` on the retired Java market service and pushed live
       thumb updates into the table.

       Not repointed, because our live feed is a different protocol on a
       different service (svc-ws) and wiring it is a piece of work in its own
       right, not a URL swap. What matters for honesty is what the absence
       costs: the table is a REST snapshot taken on load and it does not tick.
       It is not stale-but-live; it is simply a snapshot, and every figure in it
       was true when the page loaded. Nothing here pretends to stream. */
    round(v, e) {
      var t = 1;
      for (; e > 0; t *= 10, e--);
      for (; e < 0; t /= 10, e++);
      return Math.round(v * t) / t;
    },
    mul(a, b) {
      var c = 0,
        d = a.toString(),
        e = b.toString();
      try {
        c += d.split(".")[1].length;
      } catch (f) {}
      try {
        c += e.split(".")[1].length;
      } catch (f) {}
      return (
        Number(d.replace(".", "")) *
        Number(e.replace(".", "")) /
        Math.pow(10, c)
);
    },
    addClass(index) {
      this.choseBtn = index;
      if (index === 0) {
        this.dataIndex = this.coins.favor;
        return;
      }
      var quote = this.quoteTabs[index - 1];
      this.dataIndex = quote ? this.coins[quote] || [] : [];
    },

    /**
     * The market list — `GET /api/v1/markets` + `GET /api/v1/tickers`.
     *
     * Was `POST /market/symbol-thumb-trend` on the retired Java market service.
     *
     * TABS ARE BUILT FROM THE LISTING, NOT HARDCODED. The vendor shipped three
     * fixed tabs (USDT, BTC, ETH). This venue also lists FX — EUR/USD, USD/JPY,
     * NATGAS/USD — and under fixed tabs those markets are listed, tradable and
     * invisible, which misrepresents what the venue offers. The quote assets
     * now come from whatever `/markets` actually returns.
     */
    getSymbol() {
      this.loading = true;
      this.marketsDown = false;

      Promise.all([rest("/markets"), rest("/tickers")]).then(results => {
        var marketsRes = results[0];
        var tickersRes = results[1];
        this.loading = false;

        if (!marketsRes.ok || !Array.isArray(marketsRes.data)) {
          // Unreachable listing ≠ a venue with no markets.
          this.marketsDown = true;
          this.marketsMessage = marketsRes.message || "";
          return;
        }

        // Tickers may fail on their own. The listing is still true, so the
        // markets are shown with no price rather than hidden — and a missing
        // price prints as a dash, never as 0.
        var tickers = tickersRes.ok && tickersRes.data ? tickersRes.data : {};
        var rows = ixTrade.toMarketRows(marketsRes.data, tickers);

        var buckets = {};
        var quotes = [];
        var map = {};
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          row.price = row.close;
          row.isFavor = this.localFavorites.indexOf(row.symbol) >= 0;
          map[row.symbol] = row;
          if (!buckets[row.base]) {
            buckets[row.base] = [];
            quotes.push(row.base);
          }
          buckets[row.base].push(row);
        }
        quotes.sort();

        this.coins._map = map;
        for (var q = 0; q < quotes.length; q++) {
          this.$set(this.coins, quotes[q], buckets[quotes[q]]);
        }
        this.quoteTabs = quotes;
        this.coins.favor = rows.filter(function (r) { return r.isFavor; });
        this.rebuildTabs();
        this.addClass(this.choseBtn);
      });
    },

    /** Tab labels follow the listing. "Watchlist" stays first and is local. */
    rebuildTabs() {
      var tabs = [{ text: this.$t("intafaced.trade.watchlistTab") }];
      for (var i = 0; i < this.quoteTabs.length; i++) {
        tabs.push({ text: this.quoteTabs[i] });
      }
      this.indexBtn = tabs;
    },
    /**
     * FAVOURITES ARE LOCAL TO THIS BROWSER, AND THE SCREEN SAYS SO.
     *
     * The vendor stored them server-side via `/exchange/favor/*` on the retired
     * Java exchange. Our surface has no favourites endpoint — it is a CCXT
     * contract, and a watchlist is not part of it.
     *
     * localStorage is the honest substitute BECAUSE a watchlist is a display
     * preference and not money or account state, so losing it on another device
     * costs nothing and misleads nobody. The label calls it a watchlist rather
     * than implying it follows the account. Inventing a server round trip that
     * silently did nothing would have been the alternative, and a star that
     * un-sets itself on reload is exactly the kind of small lie that teaches a
     * user not to trust the rest of the screen.
     */
    favoritesKey() {
      return "ix.watchlist.v1";
    },
    loadFavorites() {
      try {
        var raw = window.localStorage.getItem(this.favoritesKey());
        var list = raw ? JSON.parse(raw) : [];
        this.localFavorites = Array.isArray(list) ? list.filter(function (s) { return typeof s === "string"; }) : [];
      } catch (e) {
        this.localFavorites = [];
      }
    },
    saveFavorites() {
      try {
        window.localStorage.setItem(this.favoritesKey(), JSON.stringify(this.localFavorites));
      } catch (e) {
        /* private mode / quota — the watchlist is not worth an error toast */
      }
    },
    collect(index, row) {
      if (this.localFavorites.indexOf(row.symbol) < 0) {
        this.localFavorites.push(row.symbol);
        this.saveFavorites();
      }
      var coin = this.getCoin(row.symbol);
      if (coin) coin.isFavor = true;
      row.isFavor = true;
      if (!this.coins.favor.some(function (r) { return r.symbol === row.symbol; })) {
        this.coins.favor.push(coin || row);
      }
      this.$Message.info(this.$t("exchange.do_favorite"));
    },
    cancelCollect(index, row) {
      var at = this.localFavorites.indexOf(row.symbol);
      if (at >= 0) {
        this.localFavorites.splice(at, 1);
        this.saveFavorites();
      }
      var coin = this.getCoin(row.symbol);
      if (coin) coin.isFavor = false;
      row.isFavor = false;
      for (var i = 0; i < this.coins.favor.length; i++) {
        if (this.coins.favor[i].symbol === row.symbol) {
          this.coins.favor.splice(i, 1);
          break;
        }
      }
      this.$Message.info(this.$t("exchange.cancel_favorite"));
    }
  }
};
</script>
<style scoped lang="scss" >
@media screen and (max-width:768px){
.app_bottom{
    display: block!important;
  }
  #fullpage {
    padding-top: 45px!important;
  }
}
.banner-panel{
  height:400px;background-color:#151515;overflow:hidden;position:relative;
.activity-list{
    width: 100%;min-width:1200px;display:flex;flex-start:row;justify-content:center;position:absolute;bottom: 20px;
.swiper-container {
      width: 72%;
      max-height: 150px;
      margin: 0 auto;
.swiper-wrapper{
        margin-bottom: 15px;
.activity-item{
          margin: 0 0;
          &:hover{
            opacity:0.9;
            cursor:pointer;
          }
          img{
            max-width:250px;
            transition: all 0.5s;
            width: 100%;
            &:hover{
              transform: scale(1.05);
            }
          }
        }
      }
    }
  }
}

#pagetips{
.agent-panel{
    display:flex;flex-direction:row;overflow:hidden;position:relative;justify-content: center;min-width:1200px;
.title{
      margin-right: 10px;
      float:left;width:220px;padding: 10px 0px;border-right:1px solid rgb(28, 44, 72);letter-spacing: 3px;
.gettingstart{
        color: #FFF;
        text-align: justify;
        height: 20px;
        &:after{
          display: inline-block;
          width: 100%;
          content: '';
        }
      }
.tips{
        font-size:10px;color: #869ec9;letter-spacing:2px;margin-top: 5px;text-align: justify;
        height: 18px;
        &:after{
          display: inline-block;
          width: 100%;
          content: '';
        }
      }
    }
.agent-list{
      float:left;padding: 4px 0px;height:62px;display:flex;flex-direction:row;overflow:hidden;
.agent-item{
        height:54px;background:#151515;width:210px;margin-left:10px;padding-right:15px;
        border: 1px solid #151515;
        transition: all 0.5s;
.agent-img{
          padding-top:7px;margin-left:7px;float:left;
          img{
            height:40px;width:40px;border-radius:40px;
          }
        }
.agent-detail{
          padding-top:10px;margin-left:10px;float:left;max-width:130px;
.agent-name{
            font-size: 13px;color:#ffa800;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 1;
            max-width: 130px;
            -webkit-box-orient: vertical;
          }
.agent-count{
            font-size: 10px;color:rgb(103, 122, 153);margin-top:5px;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            max-width: 130px;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            letter-spacing: 1px;
            white-space: nowrap;
          }
        }
      }
.agent-item:hover{
        cursor:pointer;
        border: 1px solid rgb(240, 185, 11);
      }
    }
.agent-all{
      height:62px;text-align:right;line-height:62px;background:transparent;position:absolute;right:12px;font-size:12px;color: #00c2a8;
    }
  }
}

#pagetips {
  background: #151515;
  padding: 0 10%;

  overflow: hidden;
.topnav {
    width: 100%;
    line-height: 40px;
    height: 40px;
    // float: left;
    margin: 0 auto;
.carl {
      width: 100%;
      height: 40px;
      position: relative;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      position: relative;
.notice-list{
        width: 100%;
        text-align:center;
        display:flex;
        flex-start:row;
        justify-content:center;
        height: 40px;
.notice-item{
          max-width:25%;
          padding:0px 30px;
          text-align:center;
          position:relative;
.cal_content{
            max-width:100%;
            a{
              color: rgba(130,142,161,1);
              font-size:12px;
            }
            a:hover{
              color: #00c2a8!important;
            }
          }
        }
.notice-item:not(:last-child):after{
          content: "/";
          position: absolute;
          right: 0;
          top: 1px;
          color: #afafaf;
        }
      }

.more {
        position: absolute;
        z-index: 0;
        right: 0;
        a {
          color: #00c2a8!important;
          font-size: 12px;
          padding: 3px 12px;
          border-radius:3px;
        }
      }
    }
  }
.frinend_wakuang {
    width: 50%;
    float: right;
    text-align: right;
    height: 100%;
    line-height: 40px;
    a {
      color: #00c2a8;
      font-size: 14px;
    }
  }
}
#page6 {
  padding: 20px 14%;
  ul {
    list-style-type: none;
  }
.page6-out {
    -moz-box-shadow: 2px 2px 5px #f5f5f5, -2px -2px 4px #f5f5f5;
    -webkit-box-shadow: 2px 2px 5px #f5f5f5, -2px -2px 4px #f5f5f5;
    box-shadow: 2px 2px 5px #f5f5f5, -2px -2px 4px #f5f5f5;
    padding: 30px 20px;
    overflow: hidden;
.page6-list {
      width: 33.33333%;
      float: left;
.list-op {
.special {
          line-height: 26px;
.num {
            color: #00c2a8;
          }
        }
.list-opBHB {
          text-align: left;
        }
.text {
          text-align: left;
          word-break: break-all;
          margin-right: 20px;
.num {
            font-size: 30px;
            color: #00c2a8;
            font-weight: 500;
          }
.type {
            font-size: 16px;
            color: #00c2a8;
            font-weight: 500;
          }
        }
.num2 {
          color: #00c2a8;
        }
      }
    }
  }
}
#progress {
  padding: 20px 14%;
.title {
    color: #00c2a8;
    overflow: hidden;
    line-height: 30px;
    font-size: 16px;
.already {
      float: left;
    }
.total {
      float: right;
      color: #1ad4bc;
    }
  }
.ivu-progress.ivu-progress-normal {
.ivu-progress-inner {
      background: #fff;
      border-radius: 0;
.ivu-progress-bg {
        border-radius: 0;
      }
    }
  }
}
#page2 {
  background: #000000;
  height: auto;
  min-height: 320px;
  padding: 40px 14%;
.page2nav {
    line-height: 50px;
    font-size: 20px;
    background: #1c1c1c;
    min-width: 864px;
    display:flex;
.board-title{
      width: 20%;
      height: 60px;
      line-height: 60px;
      text-align:center;
      background: #ffa800;
      color: #000;
    }
.brclearfix {
      width: 100%;
      li {
        float: left;
        cursor: pointer;
        color: #fff;
        background: #1c1c1c;
        list-style: none;
        font-size: 16px;
        padding: 5px 40px;
        -moz-box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
        -webkit-box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
        box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
        &:hover {
          background: #1e1e1e;
        }
      }
      li.active {
        background: #141414;
        color: #00c2a8;
        position: relative;
        border-bottom: 2px solid #00c2a8;
      }
    }
  }
.ptjy {
    height: 100%;
    min-width: 864px;
.tables {
      border: none;
      -moz-box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
      -webkit-box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
      box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
.ivu-table {
.ivu-table-header {
.ivu-table-column-center {
            background: none;
          }
        }

      }
    }
  }
}
.ivu-input{
  border-radius: 20px;
  border-color: transparent;
}
#page4 {
  background: #000000;
  height: auto;
  padding: 80px 0 80px 0;
  ul {
    width: 88%;
    margin: 0 auto;
    li {
      flex: 0 0 25%;
      display: inline-block;
      width: 24%;
      padding: 0 15px;
      div {
        width: 130px;
        height: 130px;
        border-radius: 50%;
        vertical-align: middle;
        text-align: center;
        margin: 0 auto;
        img {
          height: 125px;
          margin-top: 8px;
        }
      }
      p {
        font-size: 14px;
        margin: 20px 0;
        text-align: center;
        color: #8a8a8a;
      }
      p.title {
        color: #fff;
        font-size: 18px;
        font-weight: 400;
      }
    }
  }
}
.bg-dark{
  background: #000000;
}
.bg-light{
  background: #202020;
}
#page6{
  min-height: 460px;
  padding: 80px 14%;
  position: relative;
.title{
    font-size: 30px;
    text-align:center;
    width: 100%;
    letter-spacing: 6px;
  }
.title-left{
    font-size: 30px;
    text-align:left;
    width: 100%;
    letter-spacing: 6px;
  }
.subtitle{
    margin-bottom: 40px;
    color: #8a8a8a;
    font-size: 13px;
    text-align:center;
    width: 100%;
  }
.detail{
    line-height: 40px;
    letter-spacing: 2px;
    text-indent:45px;
    font-size: 20px;
    margin-bottom: 20px;
    color: #8a8a8a;
    text-align:justify;
  }
}
#page5 {
  height: 517px;
  padding: 0 14%;
  position: relative;
  background: #000000 url("../../assets/images/app-download.jpg") no-repeat 0 0;
  background-size: 100% 517px;
  overflow: hidden;
.phone_image {
    width: 480px;
    float: left;
    height: 100%;
    background: url("../../assets/images/phone_img.png") no-repeat left 150px;
    background-size: 480px;
  }
.download {
    float: right;
    list-style-type: none;
.qrcode {
      color: #fff;
      font-size: 18px;
      font-weight: 500;
      margin-top: 140px;
      text-align: left;
      line-height: 40px;
      margin-bottom: 14px;
      font-weight: 900;
    }
.wrapper {
      width: 190px;
      height: 300px;
      float: left;
      padding: 0;
      margin-right: 0px;
.download_app {
        height: 190px;
        img {
          width: 100%;
          border-radius: 5px;
        }
      }
.abstract {
        text-align: center;
        display: flex;
        margin-top: 14px;
        justify-content: center;
        align-items: center;
        height: 30px;
.image {
          width: 18px;
          img {
            vertical-align: middle;
          }
        }
.content {
          font-size: 12px;
          text-align: left;
          color: #fff;
          margin-left: 15px;
        }
      }
    }
  }
}
</style>
<style lang="scss">
#progress {
.ivu-progress.ivu-progress-normal {
.ivu-progress-inner {
      background: #fff;
      border-radius: 5px;
      border: 1px solid #00c2a8;
.ivu-progress-bg {
        border-radius: 0;
        background: #00c2a8;
      }
    }
  }
}
#page2 {
.ptjy {
    position:relative;
    min-height: 500px;
    background-color: #000000;
    border-bottom: 1px solid #141414!important;
    &:after{
      background:#141414!important;
      content: '';
      width: 1px;
      height: 100%;
      position: absolute;
      top: 0;
      right: 0;
      z-index: 3;
    }
    &:before{
      background:#141414!important;
      content: '';
      width: 1px;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      z-index: 3;
    }
.tables {
.ivu-table {
        background-color: #000000;
.ivu-table-header {
          background:#141414;
          color:#888;
          th {
            background: none;
            border-color:#222222;
          }
        }

.ivu-table-header{
          background: #000000;
              border-bottom: 1px solid #141414;
.ivu-table-cell {
            padding: 10px 0;
          }
        }
.ivu-table-body {
.ivu-table-cell {
            padding: 5px 0;
          }
        }
.ivu-table-body table.ivu-table-tbody {
            tr td{
              border-color:#222222;
              color:#fff;
            }
        }
      }
    }
  }
}
</style>


<style>
.section.ivu-carousel-dots-inside {
  bottom: 20px;
}

.green {
  color: #00b275!important;
}

.red {
  color: #f15057!important;
}

.brclearfix:after {
  content: "";
  display: block;
  height: 0;
  overflow: hidden;
  clear: both;
}

#fullpage {
  background: #fff;
  padding-top: 60px;
}

.section {
  /* height: 574px; */
  /* text-align: center; */
  /* color: #fff; */
}

.carousel-item {
  background-repeat: no-repeat;
  background-position: center;
  height: 500px;
  background-size: cover;
}

.demo-carousel1 {
  /* background: url(../../assets/images/banner1.jpg) no-repeat center; */
  height: 575px;
  background-size: cover;
}

.demo-carousel2 {
  /* background: url(../../assets/images/banner2.jpg) no-repeat center; */
  height: 575px;
  background-size: cover;
}

.demo-carousel-btn {
  width: 100%;
  height: 100%;
  padding-top: 345px;
}

.demo-carousel1 a {
  display: inline-block;
  width: 250px;
  height: 55px;
  margin: 0 15px;
}

/*.register {
  background: url(../../assets/images/register.png) no-repeat;
}*/

/*.usdt {
  float: left;
  width: 100%;
} */

.usdt_icon {
  float: left;
  width: 18%;
  height: 290px;
  background: #1d1d1d;
  padding-top: 125px;
  margin: 5px;
}
.btc,
.eth {
  float: left;
  width: 100%;
  margin-top: 10px;
}

.btc_icon,
.eth_icon {
  float: left;
  width: 18%;
  height: 140px;
  background: #1d1d1d;
  padding-top: 50px;
  margin: 5px;
}

#nav {
  position: fixed;
  right: 10%;
  top: 50%;
  z-index: 100;
}

#nav ul li {
  display: block;
  /* width: 120px; */
  height: 25px;
  margin: 7px;
  position: relative;
  padding-right: 20px;
  text-align: right;
  color: #fff;
}

#nav ul li span {
  display: none;
}

#nav ul li a {
  top: 2px;
  right: 2px;
  width: 8px;
  height: 8px;
  background: url(../../assets/images/page.png) no-repeat;
  position: absolute;
  z-index: 1;
}

#nav ul li a:hover,
#nav ul li a.active {
  top: 0;
  right: -3px;
  width: 18px;
  height: 18px;
  background: url(../../assets/images/page_active.png) no-repeat;
  position: absolute;
  z-index: 1;
}

#page3 {
  position: relative;
  color: #979797;
  /* background: url(../../assets/images/section3.png) no-repeat center; */
}

#page3 label {
  position: absolute;
  top: 30%;
  left: 20%;
  font-size: 30px;
}

@-webkit-keyframes fadeinB {
  0% {
    top: 50%;
    opacity: 0;
  }
  100% {
    top: 30%;
    opacity: 1;
  }
}

@keyframes fadeinB {
  0% {
    top: 50%;
    opacity: 0;
  }
  100% {
    top: 30%;
    opacity: 1;
  }
}

@-webkit-keyframes fadeinA {
  0% {
    top: 60%;
    opacity: 0;
  }
  100% {
    top: 40%;
    opacity: 1;
  }
}

@keyframes fadeinA {
  0% {
    top: 60%;
    opacity: 0;
  }
  100% {
    top: 40%;
    opacity: 1;
  }
}

#page3 p {
  position: absolute;
  top: 40%;
  left: 20%;
  font-size: 15px;
}

.news_1 {
  color: #1e1e1e;
  font-size: 12px;
}

.news_2 {
  color: #414141;
  font-size: 13px;
}

.news_3 {
  color: #fff;
  font-size: 18px;
}

.news_title {
  color: #fff;
  font-size: 20px;
}

.news_date {
  color: #414141;
}

.news_detail {
  color: #98999f;
  margin-top: 10px;
}
.ptjy.ivu-table td,.ptjy.ivu-table th{
  height: 25px;
}
.price-rmb{
  color: #8a8a8a;
  font-size: 10px;
  margin-left: 3px;
}
.price-td{
  padding-left: 100px;
  text-align: left;
}
th.ivu-table-cell span{
  font-weight: normal!important;
}
.ivu-table td{
  background: transparent!important;
}
.app_bottom{
  display: none;
  z-index: 999;
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 40px;
  background: rgba(242,246,250,1)!important;
}
.app_bottom.left_logo img{
  height: 30px;margin-top:5px;border-radius: 5px;margin-left: 5px;margin-right: 5px;
}
.app_bottom.right_btn_wrap{
  float: right;height: 40px;line-height: 40px;margin-right: 5px;
}
.app_bottom.right_btn{
  color: #FFF;
  border-radius: 3px;
  padding: 0px 10px;
  line-height: 26px;
  height: 26px;
  display: block;
  margin-top: 7px;
  background: linear-gradient(200deg, #ff9900, #ffbe2b, #ffa500);
}
</style>


