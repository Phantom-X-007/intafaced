<template>
  <!--
    A-UI-SUB — sub-accounts selector on the vendor exchange shell.
    Lists identity catalogue only. Never shows balances. Never routes orders.
    Money graph / placeOrder scoping = SHEHZAD (H-ID-SUB); this control stays honest.
  -->
  <div class="ix-subsel" :class="{ 'is-blocked': tradeBlocked }" role="group" :aria-label="ariaLabel">
    <Dropdown
      trigger="click"
      placement="bottom-end"
      :disabled="!hasToken || loading"
      @on-click="onPick"
    >
      <button
        type="button"
        class="ix-subsel-trigger"
        :disabled="!hasToken || loading"
        :title="statusText"
        :aria-busy="loading ? 'true' : 'false'"
      >
        <span class="ix-subsel-k">{{ $t('header.subAccounts') }}</span>
        <span class="ix-subsel-v">{{ displayLabel }}</span>
        <Icon type="md-arrow-dropdown" size="14" />
      </button>
      <DropdownMenu slot="list" class="ix-subsel-menu">
        <DropdownItem
          v-for="opt in options"
          :key="opt.isParent ? 'parent' : opt.id"
          :name="opt.isParent ? 'parent' : opt.id"
          :selected="isSelected(opt)"
        >
          <span class="ix-subsel-opt">
            <span class="ix-subsel-opt-label">{{ opt.isParent ? $t('header.subAccountParent') : opt.label }}</span>
            <span v-if="opt.isParent" class="ix-subsel-opt-meta">{{ $t('header.subAccountParentMeta') }}</span>
            <span v-else class="ix-subsel-opt-meta">{{ shortId(opt.id) }}</span>
          </span>
        </DropdownItem>
        <DropdownItem v-if="hasToken && !loading && options.length <= 1" disabled name="__empty">
          <span class="ix-subsel-opt-meta">{{ $t('header.subAccountsEmpty') }}</span>
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
    <p class="ix-subsel-note" :class="{ 'is-warn': tradeBlocked || (!hasToken && !loading) }" role="status">
      {{ statusText }}
    </p>
  </div>
</template>

<script>
import { query } from '../../config/intafaced.js';

var subAccounts = require('../../assets/js/sub-accounts.js');

export default {
  name: 'SubAccountSelector',
  data: function () {
    return {
      loading: false,
      reason: null,
      message: '',
      list: []
    };
  },
  computed: {
    hasToken: function () {
      return !!this.$store.getters.ixToken;
    },
    selectedId: function () {
      return this.$store.state.ixSubAccountId;
    },
    options: function () {
      return subAccounts.selectorOptions(this.list);
    },
    displayLabel: function () {
      if (!this.hasToken) return this.$t('header.subAccountsNeedSession');
      if (this.loading) return this.$t('common.loading');
      if (this.reason && this.reason !== 'ok') return this.$t('header.subAccountsUnavailable');
      return subAccounts.triggerLabel(this.selectedId, this.list);
    },
    tradeBlocked: function () {
      return !subAccounts.canPlaceOrder(this.selectedId);
    },
    statusText: function () {
      return subAccounts.statusNote({
        hasToken: this.hasToken,
        loading: this.loading,
        reason: this.reason,
        list: this.list,
        selectedId: this.selectedId
      });
    },
    ariaLabel: function () {
      return this.$t('header.subAccounts') + ' · ' + this.displayLabel;
    }
  },
  watch: {
    hasToken: function (on) {
      if (on) this.refresh();
      else this.resetLocal();
    }
  },
  mounted: function () {
    if (this.hasToken) this.refresh();
  },
  methods: {
    shortId: function (id) {
      if (!id) return '';
      return String(id).slice(0, 8);
    },
    isSelected: function (opt) {
      if (opt.isParent) {
        return this.selectedId == null || this.selectedId === subAccounts.PARENT_ID;
      }
      return this.selectedId === opt.id;
    },
    resetLocal: function () {
      this.loading = false;
      this.reason = null;
      this.message = '';
      this.list = [];
      this.$store.commit('setIxSubAccountId', subAccounts.PARENT_ID);
    },
    refresh: function () {
      var self = this;
      var token = this.$store.getters.ixToken;
      if (!token) {
        this.resetLocal();
        return;
      }
      this.loading = true;
      this.reason = null;
      // identity.subAccounts.list — catalogue only; no balances on the wire.
      return query('identity', 'subAccounts.list', undefined, token).then(function (res) {
        self.loading = false;
        if (!res.ok) {
          self.reason = res.reason || 'error';
          self.message = res.message || '';
          self.list = [];
          // Do not invent a prior selection when the list is unknown
          self.$store.commit('setIxSubAccountId', subAccounts.PARENT_ID);
          self.$emit('change', subAccounts.PARENT_ID);
          return res;
        }
        self.reason = 'ok';
        self.message = '';
        self.list = subAccounts.normalizeList(res.data);
        var next = subAccounts.coerceSelection(self.$store.state.ixSubAccountId, self.list);
        self.$store.commit('setIxSubAccountId', next);
        self.$emit('change', next);
        self.$emit('loaded', self.list);
        return res;
      });
    },
    onPick: function (name) {
      if (!name || name === '__empty') return;
      var id = name === 'parent' ? subAccounts.PARENT_ID : name;
      var next = subAccounts.coerceSelection(id, this.list);
      this.$store.commit('setIxSubAccountId', next);
      this.$emit('change', next);
    }
  }
};
</script>

<style scoped lang="scss">
/* Design bar: tokens only, density, no second kit. Compact desk control. */
.ix-subsel {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1, 4px);
  min-width: 0;
  max-width: 220px;
}

.ix-subsel-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border, #242a34);
  border-radius: var(--ix-radius-sm, 8px);
  background: var(--panel, #12151c);
  color: var(--text, #e8ebf0);
  font-size: var(--type-12, 12px);
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  max-width: 100%;

  &:hover:not(:disabled) {
    border-color: var(--accent, #ff6b00);
    color: var(--accent, #ff6b00);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &:focus {
    outline: 2px solid var(--accent, #ff6b00);
    outline-offset: 1px;
  }
}

.ix-subsel-k {
  color: var(--text-muted, #8a909c);
  font-size: var(--type-11, 11px);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ix-subsel-v {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 110px;
}

.ix-subsel-note {
  margin: 0;
  font-size: var(--type-11, 11px);
  line-height: 1.3;
  color: var(--text-muted, #8a909c);
  text-align: right;
  max-width: 220px;

  &.is-warn {
    color: var(--down, #f6465d);
  }
}

.ix-subsel.is-blocked .ix-subsel-trigger {
  border-color: rgba(246, 70, 93, 0.45);
}

.ix-subsel-opt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
}

.ix-subsel-opt-label {
  font-size: var(--type-13, 13px);
  color: var(--text, #e8ebf0);
}

.ix-subsel-opt-meta {
  font-size: var(--type-11, 11px);
  color: var(--text-muted, #8a909c);
  font-variant-numeric: tabular-nums;
}

@media screen and (max-width: 1100px) {
  .ix-subsel-note {
    display: none;
  }
}
</style>
