<template>
  <div
    v-if="open"
    class="ix-cmdk"
    role="dialog"
    aria-modal="true"
    aria-label="Command palette"
    @keydown.capture="onKey"
  >
    <div class="ix-cmdk-backdrop" @click="close"></div>
    <div class="ix-cmdk-panel">
      <label class="ix-cmdk-label" for="ix-cmdk-input">Go to…</label>
      <input
        id="ix-cmdk-input"
        ref="input"
        class="ix-cmdk-input"
        type="search"
        autocomplete="off"
        spellcheck="false"
        placeholder="Search routes &amp; markets…"
        :value="query"
        @input="onInput"
      />
      <p class="ix-cmdk-hint">
        <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close ·
        <kbd>{{ modKey }}</kbd>+<kbd>K</kbd>
      </p>
      <ul class="ix-cmdk-list" role="listbox" :aria-activedescendant="activeId">
        <li
          v-for="(item, i) in filtered"
          :id="'ix-cmdk-opt-' + item.id"
          :key="item.id"
          role="option"
          tabindex="-1"
          :aria-selected="i === active"
          class="ix-cmdk-item"
          :class="{ 'is-active': i === active }"
          @mouseenter="active = i"
          @click="go(item)"
        >
          <span class="ix-cmdk-item-label">{{ item.label }}</span>
          <span class="ix-cmdk-item-meta">
            <em v-if="item.group">{{ item.group }}</em>
            <code>{{ item.path }}</code>
          </span>
        </li>
        <li v-if="filtered.length === 0" class="ix-cmdk-empty" role="presentation">
          No matches — not inventing routes or markets
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
var cmdApi = require('../../assets/js/cmd-palette.js');
var a11y = require('../../assets/js/desk-a11y.js');

export default {
  name: 'CommandPalette',
  data() {
    return {
      open: false,
      query: '',
      active: 0,
      marketItems: []
    };
  },
  computed: {
    modKey() {
      if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')) {
        return '⌘';
      }
      return 'Ctrl';
    },
    catalog() {
      var base = cmdApi.defaultCmdCatalog();
      return base.concat(this.marketItems || []);
    },
    filtered() {
      return cmdApi.filterCmdItems(this.catalog, this.query);
    },
    activeId() {
      var it = this.filtered[this.active];
      return it ? 'ix-cmdk-opt-' + it.id : null;
    }
  },
  watch: {
    filtered() {
      if (this.active >= this.filtered.length) this.active = 0;
    },
    open(v) {
      if (v) {
        this._prevFocus =
          typeof document !== 'undefined' ? document.activeElement : null;
        this.query = '';
        this.active = 0;
        this.pullMarkets();
        this.$nextTick(() => {
          var el = this.$refs.input;
          if (el && el.focus) el.focus();
        });
      } else {
        this.restoreFocus();
      }
    }
  },
  mounted() {
    this._onWin = e => this.onGlobalKey(e);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onWin, true);
    }
  },
  beforeDestroy() {
    if (typeof window !== 'undefined' && this._onWin) {
      window.removeEventListener('keydown', this._onWin, true);
    }
  },
  methods: {
    onGlobalKey(e) {
      if (!e) return;
      var k = e.key || '';
      // ⌘K / Ctrl+K open or toggle
      if ((e.metaKey || e.ctrlKey) && (k === 'k' || k === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        this.open = !this.open;
        return;
      }
      if (!this.open) return;
      if (k === 'Escape') {
        e.preventDefault();
        this.close();
        return;
      }
      // B4 focus trap — keep Tab inside open dialog
      if (k === 'Tab') {
        this.trapTab(e);
      }
    },
    onKey(e) {
      if (!this.open || !e) return;
      var k = e.key || '';
      if (k === 'ArrowDown') {
        e.preventDefault();
        if (this.filtered.length) this.active = (this.active + 1) % this.filtered.length;
      } else if (k === 'ArrowUp') {
        e.preventDefault();
        if (this.filtered.length) {
          this.active = (this.active - 1 + this.filtered.length) % this.filtered.length;
        }
      } else if (k === 'Enter') {
        e.preventDefault();
        var it = this.filtered[this.active];
        if (it) this.go(it);
      }
    },
    /** Collect tabbable nodes inside the panel (input + option list items). */
    focusables() {
      var root = this.$el && this.$el.querySelector && this.$el.querySelector('.ix-cmdk-panel');
      if (!root) return [];
      var list = [];
      var input = this.$refs.input;
      if (input) list.push(input);
      var opts = root.querySelectorAll('[role="option"]');
      for (var i = 0; i < opts.length; i++) list.push(opts[i]);
      return list;
    },
    trapTab(e) {
      var nodes = this.focusables();
      if (!a11y.shouldTrapTab(this.open, nodes.length)) return;
      e.preventDefault();
      e.stopPropagation();
      var active =
        typeof document !== 'undefined' ? document.activeElement : null;
      var idx = nodes.indexOf(active);
      if (idx < 0) idx = 0;
      var next = a11y.tabWrapIndex(idx, nodes.length, !!e.shiftKey);
      if (next >= 0 && nodes[next] && nodes[next].focus) {
        nodes[next].focus();
        // Keep list selection in sync when focusing an option
        if (nodes[next].getAttribute && nodes[next].getAttribute('role') === 'option') {
          var optIdx = next - (nodes[0] === this.$refs.input ? 1 : 0);
          if (optIdx >= 0 && optIdx < this.filtered.length) this.active = optIdx;
        }
      }
    },
    restoreFocus() {
      var prev = this._prevFocus;
      this._prevFocus = null;
      if (prev && prev.focus) {
        try {
          prev.focus();
        } catch (err) {
          /* ignore */
        }
      }
    },
    onInput(e) {
      this.query = (e && e.target && e.target.value) || '';
      this.active = 0;
    },
    close() {
      this.open = false;
      this.query = '';
    },
    go(item) {
      if (!item || !item.path) return;
      this.close();
      if (this.$route && this.$route.path === item.path) return;
      this.$router.push(item.path);
    },
    pullMarkets() {
      // Only real symbols from vuex if present — never invent pairs.
      var list = [];
      try {
        var st = this.$store && this.$store.state;
        var raw =
          (st && st.coinList) ||
          (st && st.baseCoinList) ||
          (st && st.markets) ||
          [];
        if (Array.isArray(raw)) {
          for (var i = 0; i < raw.length && list.length < 40; i++) {
            var item = cmdApi.marketToCmdItem(raw[i]);
            if (item) list.push(item);
          }
        }
      } catch (err) {
        list = [];
      }
      this.marketItems = list;
    }
  }
};
</script>

<style scoped lang="scss">
.ix-cmdk {
  position: fixed;
  inset: 0;
  z-index: 9200;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 16px 16px;
}
.ix-cmdk-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
}
.ix-cmdk-panel {
  position: relative;
  width: min(520px, 100%);
  background: var(--ix-panel, #12151c);
  border: 1px solid var(--ix-border, rgba(255, 255, 255, 0.1));
  border-radius: 10px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  padding: 12px 12px 8px;
  color: var(--ix-text, #e8eaed);
}
.ix-cmdk-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.ix-cmdk-input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--ix-border, rgba(255, 255, 255, 0.12));
  background: rgba(0, 0, 0, 0.35);
  color: inherit;
  font-size: 14px;
  outline: none;
  &:focus {
    border-color: var(--ix-accent, #ff6b00);
  }
}
.ix-cmdk-hint {
  margin: 8px 2px 6px;
  font-size: 11px;
  color: var(--ix-text-muted, #8b919a);
  kbd {
    display: inline-block;
    padding: 0 4px;
    margin: 0 1px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 3px;
    font-size: 10px;
    font-family: inherit;
  }
}
.ix-cmdk-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: min(48vh, 360px);
  overflow-y: auto;
}
.ix-cmdk-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  border-radius: 6px;
  cursor: pointer;
  &.is-active,
  &:hover {
    background: rgba(255, 107, 0, 0.12);
  }
}
.ix-cmdk-item-label {
  font-size: 13px;
  font-weight: 600;
}
.ix-cmdk-item-meta {
  font-size: 11px;
  color: var(--ix-text-muted, #8b919a);
  display: flex;
  gap: 8px;
  align-items: center;
  em {
    font-style: normal;
    opacity: 0.85;
  }
  code {
    font-size: 10px;
    opacity: 0.75;
  }
}
.ix-cmdk-empty {
  padding: 16px 10px;
  text-align: center;
  font-size: 12px;
  color: var(--ix-text-muted, #8b919a);
}
</style>
