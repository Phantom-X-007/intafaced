<template>
  <div class="money-os">
    <nav class="money-os-rail" aria-label="Money">
      <router-link to="/uc/money">Balances</router-link>
      <router-link to="/uc/record">History</router-link>
      <router-link to="/uc/entrust/current" :class="{ 'router-link-exact-active': $route.path.indexOf('/uc/entrust/') === 0 }">Orders</router-link>
      <router-link to="/uc/safe">Security</router-link>
      <router-link to="/platform">Session</router-link>
      <router-link to="/uc/recharge" class="money-os-rail-refuse">Deposit <span>not live</span></router-link>
      <router-link to="/uc/withdraw" class="money-os-rail-refuse">Withdraw <span>not live</span></router-link>
    </nav>
    <section class="money-os-main" aria-label="Account workspace">
      <router-view></router-view>
    </section>
  </div>
</template>

<script>
export default {
  name: 'MemberCenter',
  created() {
    this.$store.commit('navigate', 'nav-other');
  }
};
</script>

<style lang="scss">
.money-os {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  min-height: calc(100vh - 48px);
  color: #c8c8c8;
  background: #000;
}
.money-os-rail {
  padding: 10px 8px;
  border-right: 1px solid #202020;
}
.money-os-rail a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-sizing: border-box;
  min-width: 24px;
  min-height: 24px;
  padding: 8px;
  color: #8a8a8a;
  font-size: 12px;
  line-height: 16px;
  border: 1px solid transparent;
}
.money-os-rail a.router-link-exact-active,
.money-os-rail a:hover {
  color: #c8c8c8;
  border-color: #343434;
}
.money-os-rail-refuse { color: #8a8a8a !important; }
.money-os-rail-refuse span { float: none; font-size: 10px; }
.money-os-main {
  min-width: 0;
  padding: 16px 20px 40px;
  overflow: hidden;
}
.money-os-main .nav-rights,
.money-os-main .nav-right,
.money-os-main .rightarea,
.money-os-main .bill_box,
.money-os-main .bill_flow_box,
.money-os-main .rightarea-con,
.money-os-main .entrustcurrent,
.money-os-main .entrusthistory {
  float: none !important;
  width: 100% !important;
  min-height: 0 !important;
  height: auto !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: visible !important;
  background: transparent !important;
}
.money-os-main .ivu-table-wrapper { border: 0; border-radius: 0; }
.money-os-main .ivu-table,
.money-os-main .ivu-table th,
.money-os-main .ivu-table td {
  color: #c8c8c8;
  background: #000;
  border-color: #202020;
}
.money-os-main .ivu-table th {
  color: #8a8a8a;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: .08em;
}
.money-os-main .ivu-table td {
  font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.money-os-main .ivu-table:before,
.money-os-main .ivu-table:after { background: #202020; }
.money-os-main .ivu-input,
.money-os-main .ivu-select-selection,
.money-os-main .ivu-date-picker-rel .ivu-input {
  color: #c8c8c8;
  background: #000;
  border-color: #343434;
  border-radius: 0;
}
.money-os-main .ivu-btn { border-radius: 0; }
.money-section-head { margin: 0 0 16px; }
.money-section-head h1 { margin: 0 0 7px; color: #e8e8e8; font-size: 16px; font-weight: 600; letter-spacing: .04em; }
.money-section-head p { margin: 0; color: #8a8a8a; font-size: 12px; }

@media screen and (max-width: 640px) {
  .money-os { display: block; min-height: calc(100vh - 48px); }
  .money-os-rail {
    display: flex;
    gap: 4px;
    padding: 7px 8px;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid #202020;
    scrollbar-width: none;
  }
  .money-os-rail::-webkit-scrollbar { display: none; }
  .money-os-rail a {
    flex: 0 0 auto;
    box-sizing: border-box;
    min-width: 24px;
    min-height: 24px;
    padding: 4px 8px;
    font-size: 10px;
    line-height: 16px;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .money-os-rail-refuse span { display: none; }
  .money-os-main { padding: 12px; }
  .money-os-main .ivu-table-wrapper { overflow-x: auto; }
  .money-os-main .ivu-form-item { display: block; margin-right: 0; }
}
</style>
