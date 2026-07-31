<template>
  <div class="helplist">
    <div class="route-wrap">
      <router-link to="help">{{$t("header.helpcenter")}}</router-link>
      <span>></span>
      <span>{{cateTitle}}</span>
    </div>
    <div class="container">
      <h1>{{cateTitle}}</h1>
      <!-- Stream A: failed page-query must not look like an empty category. -->
      <p v-if="loadError" class="ix-empty ix-empty-error">{{ loadError }}</p>
      <p v-else-if="!loaded" class="ix-empty ix-empty-loading">{{ $t("common.loading") }}</p>
      <p v-else-if="list.length === 0" class="ix-empty">{{ $t("cms.helpEmpty") }}</p>
      <div class="list" v-else>
        <router-link class="item" v-for="(item,index) in list" :key="index" :to="{path:'helpdetail',query:{cate:cate,id:item.id,cateTitle:cateTitle}}">
          <span class="text" >{{item.title}}</span>
          <span class="time">
            {{item.createTime}}
          </span>
        </router-link>
      </div>
      <div class="page" v-if="loaded && !loadError && total > 0">
        <Page :total="total" :pageSize="pageSize" :current="pageNo" @on-change="pageChange"></Page>
      </div>
    </div>
  </div>
</template>
<style lang="scss">
.helplist {
  width: 100%;
  margin: 0 auto;
  padding: 80px 20%;
  background: #FFF;
  color: #000;
  min-height: 800px;
.container {
    > h1 {
      text-align: center;
      margin: 30px 0 20px 0;
    }
.page {
      text-align:right;
      margin-top: 10px;
.ivu-page{
        background: transparent!important;
.ivu-page-prev,.ivu-page-next{
          background-color: transparent!important;
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
  }
}
.list {
  font-size: 16px;
.item {
    color: #464646;
    display: block;
    line-height: 40px;
    border-bottom: 1px solid #ebebeb;
    cursor: pointer;
.iconimg {
      width: 14px;
      vertical-align: sub;
      margin-left: 20px;
    }
.time {
      float: right;
      color: #999;
      font-size: 14px;
    }
    &:hover{
      color: #00c2a8;
    }
  }
}
.route-wrap {
  font-size: 14px;
  a {
    color: #1ad4bc;
  }
  span {
    color: #1ad4bc;
  }
}

</style>
<script>
export default {
  data() {
    return {
      cate: 0,
      pageNo: 1,
      pageSize: 10,
      total: 0,
      list: [],
      loaded: false,
      loadError: ""
    };
  },
  created() {
    this.$store.commit("navigate", "nav-uc");
    const { cate, cateTitle } = this.$route.query;
    this.cate = cate;
    this.cateTitle = cateTitle;
    this.getData();
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
  watch: {
    $route(to, from) {
      const { cate, cateTitle } = to.query;
      this.cate = cate;
      this.cateTitle = cateTitle;
      this.pageNo = 1;
      this.getData();
    }
  },
  methods: {
    pageChange(data) {
      this.pageNo = data;
      this.getData();
    },
    getData() {
      let params = {
        pageNo: this.pageNo,
        pageSize: this.pageSize,
        cate: this.cate,
        lang: this.langPram
      };
      this.loaded = false;
      this.loadError = "";
      this.$http
        .post(this.host + "/uc/ancillary/more/help/page", params)
        .then(res => {
          if (res.status == 200 && res.body && res.body.code == 0 && res.body.data) {
            this.list = res.body.data.content || [];
            this.total = res.body.data.totalElements || 0;
            this.loaded = true;
            this.loadError = "";
          } else {
            this.list = [];
            this.total = 0;
            this.loaded = true;
            this.loadError =
              (res.body && res.body.message) ||
              this.$t("cms.helpUnavailable");
            if (res.body && res.body.message) this.$Message.error(res.body.message);
          }
        })
        .catch(() => {
          this.list = [];
          this.total = 0;
          this.loaded = true;
          this.loadError = this.$t("cms.helpUnavailable");
        });
    }
  }
};
</script>


