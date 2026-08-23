<template>
  <Card>
    <div slot="title" class="ix-admin-orders-head">
      <strong>当前委托</strong>
      <Button type="primary" :loading="ifLoading" @click="refreshPage">
        <Icon type="refresh"></Icon>刷新
      </Button>
    </div>

    <Alert v-if="ordersError" type="error" show-icon>{{ ordersError }}</Alert>
    <p v-else-if="!ifLoading && userpage.length === 0" class="ix-admin-orders-empty">当前没有开放委托。</p>
    <Table v-else :columns="columns" :data="userpage" :loading="ifLoading"></Table>
  </Card>
</template>

<script>
export default {
  data() {
    return {
      ifLoading: false,
      ordersError: '',
      userpage: [],
      columns: [
        { title: '订单号', key: 'id', minWidth: 190 },
        { title: '用户ID', key: 'userId', minWidth: 190 },
        { title: '交易对', key: 'symbol', minWidth: 110 },
        { title: '方向', key: 'side', width: 90 },
        { title: '类型', key: 'type', width: 90 },
        { title: '委托量', key: 'amount', minWidth: 110 },
        { title: '成交量', key: 'filled', minWidth: 110 },
        { title: '剩余量', key: 'remaining', minWidth: 110 },
        {
          title: '价格',
          minWidth: 110,
          render: (h, params) => h('span', params.row.price === null ? '—' : params.row.price)
        },
        { title: '有效期', key: 'timeInForce', width: 90 },
        { title: '状态', key: 'status', width: 90 }
      ]
    };
  },
  methods: {
    refreshPage() {
      this.ifLoading = true;
      this.ordersError = '';
      this.userpage = [];
      var self = this;
      fetch('/api/v1/admin/orders/open', {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' }
        })
        .then(function(response) {
          return response.json().catch(function() { return null; }).then(function(body) {
            if (!response.ok) {
              self.ordersError = body && (body.message || body.error || body.code)
                ? String(body.message || body.error || body.code)
                : '订单服务拒绝了请求 (' + response.status + ')';
              return;
            }
            if (!Array.isArray(body)) {
              self.ordersError = '订单服务返回了无法识别的响应。';
              return;
            }
            self.userpage = body;
          });
        })
        .catch(function() {
          self.ordersError = '订单服务当前不可达。';
        })
        .then(function() {
          self.ifLoading = false;
        });
    }
  },
  created() {
    this.refreshPage();
  }
};
</script>

<style lang="less" scoped>
.ix-admin-orders-head {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ix-admin-orders-empty {
  padding: 32px 0;
  text-align: center;
  color: #808695;
}
</style>
