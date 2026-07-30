<template>
  <div class="ix-depth" ref="host">
    <canvas class="ix-depth-canvas" ref="base"></canvas>
    <canvas class="ix-depth-canvas ix-depth-hit" ref="cover"></canvas>
    <div class="ix-depth-empty" v-show="empty">{{ emptyLabel }}</div>
  </div>
</template>

<script>
/* ============================================================================
   Depth chart
   ----------------------------------------------------------------------------
   Rewritten from the vendor version, which had three defects that showed up as
   the chart "moving on its own":

   * initCanvas() ran once, on mount, while the pane was display:none. The host
     measured 0x0, so the backing store was 0x0 and every later draw painted
     into nothing. Sizing is now driven by measure(), called on show and on a
     debounced window resize.
   * the hover handler reset canvas_cover.height to a hard-coded 500 on every
     mousemove. Assigning to a canvas's height attribute reallocates the backing
     store and resizes the ELEMENT — a 500px-tall canvas inside a shorter pane,
     re-created on each pointer move. The overlay is now cleared with
     clearRect(), which does not touch geometry.
   * draw() re-assigned canvas.height each tick for the same "clear the canvas"
     reason, thrashing layout at websocket rate.

   Geometry is computed once per draw and the two canvases keep a fixed size
   until the viewport actually changes.
   ========================================================================== */
export default {
  name: 'depth-graph',
  data() {
    /* `empty` is the only value the template reads. Geometry, the point lists
       and the raw plate stay off the reactive graph — a full plate is ~240
       objects arriving once a second, and observing it every time would cost
       far more than the drawing does. */
    return {
      empty: true,
      /** 'waiting' | 'no-book' — never invent a book when the feed is silent. */
      emptyKind: 'waiting'
    };
  },
  computed: {
    emptyLabel() {
      if (this.emptyKind === 'no-book') {
        return this.$t('exchange.depthEmptyBook');
      }
      return this.$t('exchange.depthWaiting');
    }
  },
  created() {
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.bidPoints = [];
    this.askPoints = [];
    this.midX = 0;
    this.plate = null;
    this._resizeTimer = null;
    this._onResize = null;
  },
  mounted() {
    this._onResize = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this.measure(), 150);
    };
    window.addEventListener('resize', this._onResize);
    this.$nextTick(() => this.measure());
    this.bindHover();
  },
  beforeDestroy() {
    clearTimeout(this._resizeTimer);
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
    }
  },
  methods: {
    /* Read the host box and size both backing stores for the device pixel
       ratio. Returns false when the pane is hidden, so callers can skip work
       rather than paint into a zero-sized surface. */
    measure() {
      const host = this.$refs.host;
      if (!host) {
        return false;
      }
      const w = Math.floor(host.clientWidth);
      const h = Math.floor(host.clientHeight);
      if (w <= 0 || h <= 0) {
        return false;
      }
      const dpr = window.devicePixelRatio || 1;
      if (w === this.width && h === this.height && dpr === this.dpr) {
        return true;
      }
      this.width = w;
      this.height = h;
      this.dpr = dpr;
      [this.$refs.base, this.$refs.cover].forEach(c => {
        if (!c) {
          return;
        }
        c.width = Math.floor(w * dpr);
        c.height = Math.floor(h * dpr);
        c.style.width = w + 'px';
        c.style.height = h + 'px';
        c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      });
      if (this.plate) {
        this.render();
      }
      return true;
    },

    /* Public entry point, called by the page with an exchange-plate-full
       payload. Tolerates a partial or empty body. */
    draw(plate) {
      this.plate = plate || null;
      if (!plate) {
        this.empty = true;
        this.emptyKind = 'waiting';
      }
      if (!this.measure()) {
        return;
      }
      this.render();
    },

    render() {
      const ctx = this.$refs.base && this.$refs.base.getContext('2d');
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, this.width, this.height);
      this.clearOverlay();

      if (!this.plate) {
        this.empty = true;
        this.emptyKind = 'waiting';
        return;
      }

      const bids = this.cumulative(this.pick(this.plate, 'bid'));
      const asks = this.cumulative(this.pick(this.plate, 'ask'));
      this.empty = bids.length === 0 && asks.length === 0;
      if (this.empty) {
        this.emptyKind = 'no-book';
        return;
      }

      const peak = Math.max(
        bids.length ? bids[bids.length - 1].total : 0,
        asks.length ? asks[asks.length - 1].total : 0
      );
      if (peak <= 0) {
        this.empty = true;
        this.emptyKind = 'no-book';
        return;
      }

      const pad = 8;
      const usable = this.height - pad * 2;
      const mid = Math.floor(this.width / 2);
      this.midX = mid;
      const y = total => pad + usable - (total / (peak * 1.08)) * usable;

      /* Bids fan out to the left of the mid line, asks to the right. */
      this.bidPoints = bids.map((row, i) => ({
        x: mid - (i / Math.max(bids.length - 1, 1)) * mid,
        y: y(row.total),
        price: row.price,
        total: row.total
      }));
      this.askPoints = asks.map((row, i) => ({
        x: mid + (i / Math.max(asks.length - 1, 1)) * (this.width - mid),
        y: y(row.total),
        price: row.price,
        total: row.total
      }));

      this.fill(ctx, this.bidPoints, mid, 'rgba(0, 178, 117, 0.28)', '#00b275');
      this.fill(ctx, this.askPoints, mid, 'rgba(255, 74, 104, 0.24)', '#ff4a68');

      /* Mid line — the only vertical rule on the chart. */
      ctx.beginPath();
      ctx.setLineDash([3, 4]);
      ctx.moveTo(mid + 0.5, 0);
      ctx.lineTo(mid + 0.5, this.height);
      ctx.strokeStyle = 'rgba(255, 107, 0, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    },

    fill(ctx, points, mid, fillStyle, strokeStyle) {
      if (points.length < 2) {
        return;
      }
      ctx.beginPath();
      ctx.moveTo(points[0].x, this.height);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, this.height);
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();

      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    },

    pick(plate, side) {
      if (!plate || !plate[side] || !Array.isArray(plate[side].items)) {
        return [];
      }
      /* A full plate can carry thousands of levels; past ~120 the extra points
         are sub-pixel and only cost time. */
      return plate[side].items.slice(0, 120);
    },

    /* Running total, built into fresh objects — the vendor mutated the response
       in place, which double-counted whenever the same payload was drawn twice. */
    cumulative(items) {
      let total = 0;
      const out = [];
      for (let i = 0; i < items.length; i++) {
        const amount = Number(items[i].amount) || 0;
        total += amount;
        out.push({ price: Number(items[i].price) || 0, total });
      }
      return out;
    },

    clearOverlay() {
      const ctx = this.$refs.cover && this.$refs.cover.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, this.width, this.height);
      }
    },

    bindHover() {
      const cover = this.$refs.cover;
      if (!cover) {
        return;
      }
      cover.addEventListener('mouseleave', () => this.clearOverlay(), false);
      cover.addEventListener(
        'mousemove',
        e => {
          const ctx = cover.getContext('2d');
          if (!ctx || this.empty) {
            return;
          }
          const rect = cover.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const point = this.nearest(x <= this.midX ? this.bidPoints : this.askPoints, x);
          /* clearRect, never a height assignment — see the header note. */
          ctx.clearRect(0, 0, this.width, this.height);
          if (!point) {
            return;
          }

          ctx.beginPath();
          ctx.moveTo(point.x + 0.5, 0);
          ctx.lineTo(point.x + 0.5, this.height);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(point.x, point.y, 3.5, 0, 2 * Math.PI);
          ctx.fillStyle = '#ff6b00';
          ctx.fill();

          const w = 148;
          const h = 46;
          const bx = Math.min(Math.max(point.x - w / 2, 4), this.width - w - 4);
          const by = Math.min(Math.max(point.y - h - 12, 4), this.height - h - 4);
          ctx.fillStyle = 'rgba(13, 13, 13, 0.94)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
          this.roundRect(ctx, bx, by, w, h, 8);
          ctx.fill();
          ctx.stroke();

          ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillStyle = '#6b6b6b';
          ctx.fillText('Price', bx + 10, by + 18);
          ctx.fillText('Total', bx + 10, by + 35);
          ctx.fillStyle = '#f2f2f2';
          ctx.fillText(this.trim(point.price), bx + 56, by + 18);
          ctx.fillText(this.trim(point.total), bx + 56, by + 35);
        },
        false
      );
    },

    roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },

    trim(value) {
      const n = Number(value) || 0;
      return n.toFixed(n >= 1000 ? 2 : 6).replace(/\.?0+$/, '');
    },

    nearest(points, x) {
      let best = null;
      let bestDistance = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = Math.abs(points[i].x - x);
        if (d < bestDistance) {
          bestDistance = d;
          best = points[i];
        }
      }
      return bestDistance <= 24 ? best : null;
    }
  }
};
</script>

<style scoped>
.ix-depth {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.ix-depth-canvas {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
}

.ix-depth-hit {
  cursor: crosshair;
}

.ix-depth-empty {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ix-text-faint, #6b6b6b);
}
</style>
