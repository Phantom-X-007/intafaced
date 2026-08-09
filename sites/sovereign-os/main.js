(() => {
  const toggle = document.getElementById('navToggle');
  const drawer = document.getElementById('drawer');
  if (toggle && drawer) {
    // populate drawer from desktop links if empty
    if (!drawer.children.length) {
      document.querySelectorAll('.nav-links a').forEach((a) => {
        const c = a.cloneNode(true);
        drawer.appendChild(c);
      });
      const w = document.createElement('a');
      w.href = '#waitlist';
      w.textContent = 'Waitlist';
      drawer.appendChild(w);
    }
    toggle.addEventListener('click', () => {
      const open = drawer.classList.toggle('open');
      drawer.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    drawer.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        drawer.classList.remove('open');
        drawer.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // tabs
  document.querySelectorAll('[role="tablist"]').forEach((list) => {
    const tabs = Array.from(list.querySelectorAll('[role="tab"], .tab'));
    const root = list.parentElement;
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const key = tab.getAttribute('data-tab');
        tabs.forEach((t) => t.setAttribute('aria-selected', t === tab ? 'true' : 'false'));
        root.querySelectorAll('.tabpanel').forEach((p) => {
          const on = p.getAttribute('data-panel') === key;
          p.classList.toggle('active', on);
          p.hidden = !on;
        });
      });
    });
  });

  // plane toggle — emphasizes selected plane
  document.querySelectorAll('.ptab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plane = btn.getAttribute('data-plane');
      document.querySelectorAll('.ptab').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.querySelectorAll('[data-plane-panel]').forEach((panel) => {
        const on = panel.getAttribute('data-plane-panel') === plane;
        panel.style.opacity = on ? '1' : '0.45';
        panel.style.outline = on ? '1px solid rgba(184,255,60,0.25)' : 'none';
      });
    });
  });

  // waitlist mailto
  const form = document.getElementById('waitlistForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('email');
      if (!email || !email.value) return;
      const body = encodeURIComponent(`CUT MY KEY / Sovereign OS waitlist\nEmail: ${email.value}\nSource: apply site v2`);
      window.location.href = `mailto:hello@intafaced.com?subject=${encodeURIComponent('CUT MY KEY / Sovereign OS waitlist')}&body=${body}`;
    });
  }

  // scroll fade-in
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('on');
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    document.querySelectorAll('section').forEach((s) => {
      s.classList.add('fade-in');
      io.observe(s);
    });
  }

  // Lightweight Charts demo
  function mountChart() {
    const el = document.getElementById('tv-demo-chart');
    if (!el || typeof LightweightCharts === 'undefined') return;
    const chart = LightweightCharts.createChart(el, {
      layout: {
        background: { type: 'solid', color: '#050806' },
        textColor: '#8b9c91',
      },
      grid: {
        vertLines: { color: '#1c2922' },
        horzLines: { color: '#1c2922' },
      },
      rightPriceScale: { borderColor: '#1c2922' },
      timeScale: { borderColor: '#1c2922' },
      width: el.clientWidth,
      height: 280,
    });
    const series = chart.addCandlestickSeries({
      upColor: '#b8ff3c',
      downColor: '#ff6b4a',
      borderVisible: false,
      wickUpColor: '#b8ff3c',
      wickDownColor: '#ff6b4a',
    });
    // synthetic walk
    const data = [];
    let t = Math.floor(Date.UTC(2024, 0, 1) / 1000);
    let price = 64000;
    for (let i = 0; i < 120; i++) {
      const open = price;
      const change = (Math.sin(i / 7) + (Math.random() - 0.5) * 2) * 180;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * 120;
      const low = Math.min(open, close) - Math.random() * 120;
      data.push({ time: t, open, high, low, close });
      price = close;
      t += 86400;
    }
    series.setData(data);
    chart.timeScale().fitContent();
    window.addEventListener('resize', () => {
      chart.applyOptions({ width: el.clientWidth });
    });
  }

  if (document.readyState === 'complete') mountChart();
  else window.addEventListener('load', mountChart);
})();
