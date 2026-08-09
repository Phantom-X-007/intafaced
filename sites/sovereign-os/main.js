(() => {
  // Plane switcher
  const buttons = Array.from(document.querySelectorAll('.plane-switch button'));
  const panels = Array.from(document.querySelectorAll('.plane'));
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-plane');
      buttons.forEach((b) => {
        const on = b === btn;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      panels.forEach((p) => {
        const on = p.getAttribute('data-panel') === id;
        p.classList.toggle('show', on);
        p.hidden = !on;
      });
    });
  });

  // Lightweight Charts demo
  function mountChart() {
    const el = document.getElementById('chart');
    if (!el || typeof LightweightCharts === 'undefined') return;

    const chart = LightweightCharts.createChart(el, {
      layout: {
        background: { type: 'solid', color: '#040705' },
        textColor: '#7f9186',
        fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
      },
      grid: {
        vertLines: { color: '#121a15' },
        horzLines: { color: '#121a15' },
      },
      rightPriceScale: { borderColor: '#1a261f' },
      timeScale: { borderColor: '#1a261f' },
      crosshair: {
        vertLine: { color: 'rgba(198,255,61,0.25)' },
        horzLine: { color: 'rgba(198,255,61,0.25)' },
      },
      width: el.clientWidth,
      height: 300,
    });

    const series = chart.addAreaSeries({
      lineColor: '#c6ff3d',
      topColor: 'rgba(198,255,61,0.28)',
      bottomColor: 'rgba(198,255,61,0.01)',
      lineWidth: 2,
    });

    const data = [];
    let t = Math.floor(Date.UTC(2025, 0, 1) / 1000);
    let price = 64000;
    for (let i = 0; i < 90; i++) {
      price = price + Math.sin(i / 5) * 220 + (Math.random() - 0.48) * 280;
      data.push({ time: t, value: price });
      t += 86400;
    }
    series.setData(data);
    chart.timeScale().fitContent();

    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    window.addEventListener('resize', onResize);
  }

  if (document.readyState === 'complete') mountChart();
  else window.addEventListener('load', mountChart);
})();
