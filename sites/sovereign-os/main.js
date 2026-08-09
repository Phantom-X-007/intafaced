(() => {
  const toggle = document.getElementById('navToggle');
  const drawer = document.getElementById('drawer');
  if (toggle && drawer) {
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

  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('aria-controls');
      tabs.forEach((t) => t.setAttribute('aria-selected', t === tab ? 'true' : 'false'));
      panels.forEach((p) => {
        const on = p.id === target;
        p.classList.toggle('active', on);
        p.hidden = !on;
      });
    });
  });

  const form = document.getElementById('waitlistForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      const email = /** @type {HTMLInputElement|null} */ (document.getElementById('email'));
      if (!email || !email.value) return;
      e.preventDefault();
      const body = encodeURIComponent(`CUT MY KEY / Sovereign OS waitlist\nEmail: ${email.value}\nSource: trade apply site`);
      window.location.href = `mailto:hello@intafaced.com?subject=${encodeURIComponent('CUT MY KEY / Sovereign OS waitlist')}&body=${body}`;
    });
  }
})();
