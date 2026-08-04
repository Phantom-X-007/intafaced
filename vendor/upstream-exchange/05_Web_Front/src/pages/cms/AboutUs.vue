<style lang="scss" scoped>
.about_us_container {
  padding: 60px 0 20px 0;
  .wrapper {
    margin: 30px 12%;
    background-color: #0a0c10;
    border: 1px solid #1a1e26;
    border-radius: 8px;
    padding: 20px 40px;
    h2 {
      font-weight: 500;
      height: 50px;
      font-size: 20px;
      border-bottom: 1px solid #1a1e26;
      line-height: 50px;
      color: #e8eaed;
    }
    .wrapper_logo ul {
      display: flex;
      justify-content: space-between;
      align-items: stretch;
      padding: 20px 0;
      border-bottom: 1px solid #1a1e26;
      min-height: 240px;
      flex-wrap: wrap;
      li {
        width: 25%;
        min-width: 160px;
        padding: 12px 16px;
        list-style-type: none;
        border-right: 1px solid #1a1e26;
        text-align: center;
        box-sizing: border-box;
        img {
          width: 100px;
        }
        h5 {
          line-height: 1.4;
          font-size: 16px;
          font-weight: 500;
          color: #e8eaed;
          margin: 12px 0 8px;
        }
        span {
          color: #8a8a8a;
          font-size: 12px;
          line-height: 1.5;
          display: block;
        }
      }
    }
    .content_wrapper {
      padding: 20px 0;
      .content1 {
        border-bottom: 1px solid #1a1e26;
        padding-bottom: 20px;
        margin-bottom: 20px;
        h5 {
          font-size: 18px;
          line-height: 40px;
          font-weight: 500;
          margin-bottom: 15px;
          color: #e8eaed;
        }
        p {
          font-size: 14px;
          line-height: 30px;
          color: #8a8a8a;
          margin-bottom: 15px;
          text-indent: 30px;
          text-align: justify;
        }
        .ix-contact-list {
          list-style: none;
          padding: 0;
          margin: 0;
          text-indent: 0;
          li {
            font-size: 14px;
            line-height: 1.6;
            color: #8a8a8a;
            margin-bottom: 8px;
            text-indent: 0;
            strong {
              color: #c8cdd4;
              font-weight: 600;
              display: inline-block;
              min-width: 100px;
            }
          }
        }
      }
    }
  }
}

.ix-dualbook.ix-about-note {
  margin: 0 0 16px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 107, 0, 0.35);
  border-radius: 6px;
  background: rgba(255, 107, 0, 0.06);
  color: #c8cdd4;
  font-size: 12.5px;
  line-height: 1.5;
  text-indent: 0;
}
.ix-dualbook.ix-about-note strong {
  color: #ff6b00;
  font-weight: 600;
}

@media (max-width: 900px) {
  .about_us_container .wrapper {
    margin: 20px 4%;
    padding: 16px 18px;
    .wrapper_logo ul li {
      width: 50%;
      border-right: none;
      border-bottom: 1px solid #1a1e26;
      min-height: auto;
      padding-bottom: 20px;
    }
  }
}
</style>

<template>
  <div class="about_us_container">
    <div class="wrapper">
      <h2 class="title">{{ $t('cms.features') }}</h2>
      <p class="ix-dualbook ix-about-note" role="note">
        <strong>{{ $t("shellResidual.aboutTitle") }}</strong> {{ $t("shellResidual.aboutNote") }}
      </p>
      <div class="wrapper_logo">
        <ul>
          <li>
            <img src="../../assets/images/feature_safe.png" alt="" />
            <h5>{{ $t('description.title1') }}</h5>
            <span>{{ $t('description.message1') }}</span>
          </li>
          <li>
            <img src="../../assets/images/feature_fast.png" alt="" />
            <h5>{{ $t('description.title2') }}</h5>
            <span>{{ $t('description.message2') }}</span>
          </li>
          <li>
            <img src="../../assets/images/feature_global.png" alt="" />
            <h5>{{ $t('description.title3') }}</h5>
            <span>{{ $t('description.message3') }}</span>
          </li>
          <li style="border: none">
            <img src="../../assets/images/feature_choose.png" alt="" />
            <h5>{{ $t('description.title4') }}</h5>
            <span>{{ $t('description.message4') }}</span>
          </li>
        </ul>
      </div>
      <div class="content_wrapper">
        <div class="content1">
          <h5>{{ $t('cms.aboutus') }}</h5>
          <p>{{ $t('description.aboutdesc1') }}</p>
          <p>{{ $t('description.aboutdesc2') }}</p>
          <p>{{ $t('description.aboutdesc3') }}</p>
          <p>{{ $t('description.aboutdesc4') }}</p>
          <p>{{ $t('description.aboutdesc5') }}</p>
        </div>
        <div class="content1">
          <h5>{{ $t('cms.contactus') }}</h5>
          <ul class="ix-contact-list" role="list">
            <li>
              <strong>{{ $t('description.service') }}</strong>
              <span>{{ $t("shellResidual.notPublishedInbox") }}</span>
            </li>
            <li>
              <strong>{{ $t('description.support') }}</strong>
              <span>{{ $t("shellResidual.notPublishedHelp") }}</span>
            </li>
            <li>
              <strong>{{ $t('description.apply') }}</strong>
              <span>{{ $t("shellResidual.notPublishedInbox") }}</span>
            </li>
            <li>
              <strong>{{ $t('description.report') }}</strong>
              <span>{{ $t("shellResidual.notPublishedInbox") }}</span>
            </li>
            <li>
              <strong>{{ $t('description.coop') }}</strong>
              <span>{{ $t("shellResidual.notPublishedInbox") }}</span>
            </li>
          </ul>
        </div>
        <div class="content1" style="border: none">
          <h5>{{ $t('description.community') }}</h5>
          <!-- The row named six specific platforms, three of which (WeChat,
               Weibo, Biyong) are China-only and were here because the upstream
               vendor operated there. Naming a platform we have no account on is
               a plan, not a contact route, and a reader cannot tell the two
               apart. One honest line replaces six. -->
          <ul class="ix-contact-list" role="list">
            <li>
              <strong>{{ $t("shellResidual.channels") }}</strong>
              <span>{{ $t("shellResidual.nonePublishedYet") }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AboutUs',
  created() {
    this.$store.commit('navigate', 'nav-about');
  },
  computed: {
    lang() {
      return this.$store.state.lang;
    }
  }
};
</script>
