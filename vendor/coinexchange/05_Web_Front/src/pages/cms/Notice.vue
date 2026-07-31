<template>
  <div class="notice">
    <div class="banner">
      <!-- <img class="bannerimg" src="../../assets/images/help_banner.png"> -->
      <span>{{$t("header.service")}}</span>
    </div>
    <div class="main">
      <!-- Stream A: failed announcement list must not look like empty success. -->
      <p v-if="loadError" class="ix-empty ix-empty-error">{{ loadError }}</p>
      <p v-else-if="!loaded" class="ix-empty ix-empty-loading">{{ $t("common.loading") }}</p>
      <p v-else-if="FAQList.length === 0" class="ix-empty">{{ $t("cms.noticeEmpty") }}</p>
      <div class="list" v-else>
        <div class="item" v-for="item in FAQList" :key="item.id" @click="noticedeail(item.id)">
        <img v-show="item.isTop==0" class="iconimg" src="../../assets/images/icon-top.png" alt="">
          <span class="text">{{item.title}}</span>

          <span class="time">
            {{item.createTime}}
          </span>
        </div>
      </div>
      <div class="page" v-if="loaded && !loadError && totalNum > 0">
        <Page :total="totalNum" :pageSize="pageSize" :current="pageNo" @on-change="loadDataPage"></Page>
      </div>
    </div>
    <!-- <div class="help_container">
          <div style="line-height: 40px;font-size:16px;"><router-link to="/help" style="color:#00c2a8;">{{$t('cms.servicecenter')}}</router-link>->{{$t('cms.notice')}}</div>

            <Col span="24" style="padding:0 2%;color:#000;font-size:18px;background:#fff">
                <div class="faqlist">
                    <div v-for="item,index in FAQList" class="faqitem" @click="noticedeail(item.id)" v-if="titleLang(item.title)===lang">{{item.title}}
                        <span style="float:right">{{item.createTime}}</span>
                    </div>
                </div>
            </Col>

        </div>
        <Col span="24" style="padding:100px 0;">


         </Col> -->
  </div>
</template>
<style lang="scss" scoped>
.notice {
.banner {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 320px;
    background: linear-gradient(to right, #111111, #000109);
    background-size: 100% 100%;
    color: #fff;
    font-size: 40px;
  }
.main {
    width: 70%;
    margin: 0 auto;
    background-color: #000000;
    color: #fff;
    // box-shadow: 0 0 2px #ccc;
    margin-top: -50px;
    border-radius: 6px;
    padding: 50px 100px;
    margin-bottom: 50px;
.list {
      font-size: 14px;
.item {
        line-height: 50px;
        height:50px;
        border-bottom: 1px solid #141414;
        cursor: pointer;
.iconimg {
          width: 35px;
          vertical-align: sub;
          margin-left: 10px;
          padding-bottom: 5px;
        }
.time {
          float: right;
          color: #999;
          font-size: 14px;
        }
.text{
          display: inline-block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          width: 70%;
          &:hover{
            color: #00c2a8;
          }
        }
      }
    }
.page {
      text-align: right;
      margin-top: 20px;
    }
  }
}
</style>
<script>
export default {
  data() {
    return {
      pageNo: 1,
      pageSize: 10,
      totalNum: 0,
      FAQList: [],
      loaded: false,
      loadError: ""
    };
  },
  created: function() {
    this.init();
  },
  computed: {
    lang() {
      return this.$store.state.lang;
    },
    langPram() {
      // English only — the backend must never be asked for CN content.
      return "EN";
    }
  },
  methods: {
    init() {
      this.$store.state.HeaderActiveName = "1-7";
      this.$store.commit("navigate", "nav-service");
      this.loadDataPage(this.pageNo);
    },
    loadDataPage(pageIndex) {
      var param = {};
      param["pageNo"] = pageIndex;
      param["pageSize"] = this.pageSize;
      param["lang"] = this.langPram;
      this.pageNo = pageIndex;
      this.loaded = false;
      this.loadError = "";
      this.$http
        .post(this.host + this.api.uc.announcement, param)
        .then(response => {
          var resp = response.body;
          if (resp && resp.code == 0 && resp.data) {
            // empty content is success empty — not failure, not silent no-op
            this.FAQList = resp.data.content || [];
            this.totalNum = resp.data.totalElements || 0;
            this.loaded = true;
            this.loadError = "";
          } else {
            this.FAQList = [];
            this.totalNum = 0;
            this.loaded = true;
            this.loadError =
              (resp && resp.message) || this.$t("cms.noticeUnavailable");
            this.$Notice.error({
              title: this.$t("common.tip"),
              desc: this.loadError
            });
          }
        })
        .catch(() => {
          this.FAQList = [];
          this.totalNum = 0;
          this.loaded = true;
          this.loadError = this.$t("cms.noticeUnavailable");
        });
    },
    noticedeail(id) {
      var path = { path: "/notice/index", query: { id: id } };
      this.$router.push(path);
    },
    titleLang(str) {
      const reg = new RegExp("[\\u4E00-\\u9FFF]+", "g");
      if (reg.test(str)) {
        return "Chinese";
      } else {
        return "English";
      }
    }
  }
};
</script>

