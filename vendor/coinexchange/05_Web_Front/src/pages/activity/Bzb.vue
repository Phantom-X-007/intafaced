<style lang="scss" scoped>
.content_container {
  // background-color: #eee;
  padding: 60px 0 20px 0;
.wrapper {
    margin: 30px 12%;
    background-color: #000000;
    padding: 20px 40px;
    h2 {
      font-weight: 400;
      height: 50px;
      font-size: 20px;
      line-height: 50px;
    }
.wrapper_logo ul {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 30px;
      min-height:280px;
      flex-wrap: wrap;
      li {
        width: 25%;
        padding: 0 20px;
        list-style-type: none;
        text-align: center;
        min-height: 240px;
        img{
          width: 100px;
        }
        h5 {
          line-height: 50px;
          font-size: 20px;
          font-weight:400;
        }
        span {
          color: #8a8a8a;
          font-size: 12px;
        }
      }
    }
.content_wrapper {
      padding: 20px 0;
.content1 {
        padding-bottom: 20px;
        margin-bottom: 20px;
        h5 {
          font-size: 18px;
          line-height: 40px;
          font-weight: 500;
          margin-bottom: 15px;
        }
        p {
          font-size: 14px;
          line-height: 30px;
          color: #8a8a8a;
          margin-bottom: 15px;
          text-indent: 30px;
          // margin-bottom: 14px;
          text-align: justify;
        }
      }
    }
  }
}
</style>

<template>
  <div class="content_container">
    <div class="wrapper">
      <div class="content_wrapper">
        <div class="content1">
          <h5>Overview</h5>
          <p>The INTAFACED token is the platform's rights certificate, capped at a fixed supply
            that is never inflated. Holders share in trading-fee revenue and listing
            distributions, and may stake toward a super node. Node operators carry governance
            weight, early visibility on listings, listing priority, and a claim on future
            distributions.
          </p>
          <p>The token is the single rights certificate across the whole INTAFACED ecosystem —
            the protocol plane, the DEX, banking, the launchpad and the agent network. INTAFACED
            is an open ecosystem: any credible project may build against it, and early
            participants receive a development allocation.
          </p>
        </div>
      </div>
      <h2 class="title">Token Rights</h2>
      <div class="wrapper_logo">
        <ul>
          <li>
            <img src="../../assets/images/token/dividends.svg" alt="">
            <h5>{{$t('bzb_description.title1')}}</h5>
            <span>{{$t('bzb_description.desc1')}}</span>
          </li>
          <li>
            <img src="../../assets/images/token/discount.svg" alt="">
            <h5>{{$t('bzb_description.title2')}}</h5>
            <span>{{$t('bzb_description.desc2')}}</span>
          </li>
          <li>
            <img src="../../assets/images/token/subscription.svg" alt="">
            <h5>{{$t('bzb_description.title3')}}</h5>
            <span>{{$t('bzb_description.desc3')}}</span>
          </li>
          <li>
            <img src="../../assets/images/token/voting.svg" alt="">
            <h5>{{$t('bzb_description.title4')}}</h5>
            <span>{{$t('bzb_description.desc4')}}</span>
          </li>
          <li>
            <img src="../../assets/images/token/disclosure.svg" alt="">
            <h5>{{$t('bzb_description.title5')}}</h5>
            <span>{{$t('bzb_description.desc5')}}</span>
          </li>
          <li>
            <img src="../../assets/images/token/listing.svg" alt="">
            <h5>{{$t('bzb_description.title6')}}</h5>
            <span>{{$t('bzb_description.desc6')}}</span>
          </li>
          <li>
            <img src="../../assets/images/token/governance.svg" alt="">
            <h5>{{$t('bzb_description.title7')}}</h5>
            <span>{{$t('bzb_description.desc7')}}</span>
          </li>
          <li>
            <img src="../../assets/images/token/more.svg" alt="">
            <h5>{{$t('bzb_description.title8')}}</h5>
            <span>{{$t('bzb_description.desc8')}}</span>
          </li>
        </ul>
      </div>
      <div class="content_wrapper">
        <div class="content1">
          <h5>Whitepaper</h5>
          <p>INTAFACED-Whitepaper.pdf</p>
        </div>
      </div>
    </div>
  </div>
</template>
<script>
export default {
  components: {},
  created() {
    this.init();
  },
  computed: {
    lang() {
      return this.$store.state.lang;
    }
  },
  methods: {
    init() {
      this.$store.commit("navigate", "nav-bzb");
    }
  }
};
</script>
<style scoped>
.container {
  background: #fff;
  overflow-x: hidden;
}

.content-wrap {
  padding-top: 20px;
  position: relative;
  width: 1200px;
  margin: 0 auto;
  background: #fff;
  min-height: 600px;
}

.leftmenu {
  border: 1px solid #efefef;
}

.leftmenu.divider {
  font-size: 20px;
  padding: 5px;
  background: #efefef;
}

.leftmenu li {
  font-size: 14px;
  line-height: 30px;
  padding: 5px;
}

.leftmenu li a {
  color: #444;
}

.leftmenu li a:hover {
  color: #ff6b00;
}

.leftmenu li.cur a {
  color: #ff6b00;
}
.content {
  padding-top: 20px;
  /*padding-left: 200px;*/
  padding-bottom: 20px;
  text-align: left;
  padding-left: 20px;
}

.content.ivu-col {
  text-align: left;
}

.content p {
  text-indent: 2em;
  margin-bottom: 10px;
  font-size: 16px;
}
.content > div {
  padding-bottom: 20px;
}
.content h3 {
  font-size: 22px;
  font-weight: normal;
  margin-bottom: 20px;
}
.content h5 {
  font-size: 14px;
}
.WordSection1 span {
  color: black;
}
</style>
