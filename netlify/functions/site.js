

// ── Branche → Widget-ID Mapping (Werte hier eintragen) ──────────────────────
const BRANCHE_WIDGETS = {
  Brautmoden:        '69ca8f1fc754a3ea80be1481', // ✅ vorhanden
  Trauringe:         '6a14349c564f861b7575218d',
  Fotograf:          '6a1434d0066e92e8da6d2bba',
  Videograf:         '6a1434fb02747d6f6ac4d9cc',
  Konditor:          '6a143521066e9213866d2bc7',
  Catering:          '6a143a3502747d3750c4da63',
  Hochzeitslocation: '6a143a5102747d20ffc4da6d',
  Trauredner:        '6a143a73428ac3762481c34a',
  Hochzeitsplaner:   '6a143a98564f863a4d752257',
  Floristen:         '6a143ac0564f860d407522b0',
  Default:           '6a143b11564f8678f67522cd', // Fallback = Brautmoden
};

exports.handler = async (event) => {
  const p       = event.queryStringParameters || {};
  const url     = p.url;
  const email   = p.email   || '';
  const vorname = p.vorname || '';
  const name    = p.name    || '';

  // ── Branche → Widget-ID ──
  const branche  = p.branche || 'Brautmoden';
  const widgetId = BRANCHE_WIDGETS[branche] || BRANCHE_WIDGETS.Brautmoden;

  if (!url) return { statusCode: 400, body: 'Missing url' };

  // Website holen
  let html;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        'Accept':     'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    html = await res.text();
  } catch (e) {
    return { statusCode: 502, body: 'Fetch failed: ' + e.message };
  }

  // Basis-URL für relative Pfade setzen
  const base = new URL(url).origin;
  html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${base}/">`);

  // Widget + Auto-Fill + Cookie-Banner-Unterdrückung einfügen
  const inject = `
<style>
/* Cookie Banner verstecken */
#CybotCookiebotDialog, #cookieNotice, #onetrust-banner-sdk,
#consent-popup, #cookie-law-info-bar, .cookie-banner,
.cookie-notice, .cookie-popup, .cookie-consent, .cookie-bar,
.cc-window, .cc-banner, .pum-container,
[id*="cookie"][id*="banner"], [id*="cookie"][id*="notice"],
[id*="cookie"][id*="popup"], [id*="cookie"][id*="dialog"],
[class*="cookie-banner"], [class*="cookie-notice"],
[class*="cookie-consent"], [class*="cookie-bar"],
.borlabs-cookie, #usercentrics-root {
  display: none !important;
}
body { overflow: auto !important; }
</style>

<script src="https://beta.leadconnectorhq.com/loader.js"
  data-resources-url="https://beta.leadconnectorhq.com/chat-widget/loader.js"
  data-widget-id="${widgetId}">
</script>

<script>
const _fn = '${vorname}', _ln = '${name}', _em = '${email}';
let _sr;

function _waitWidget() {
  const w = document.querySelector('chat-widget');
  if (!w) { setTimeout(_waitWidget, 100); return; }
  const t = setInterval(() => {
    _sr = w.shadowRoot;
    if (_sr) { clearInterval(t); _setSize(); setTimeout(_fill, 800); }
  }, 50);
}

function _setSize() {
  const t = setInterval(() => {
    const dw = _sr.querySelector('div#lc_text-widget');
    const db = _sr.querySelector('div#lc_text-widget--box');
    if (dw && db) {
      clearInterval(t);
      dw.setAttribute('style', 'right:50px;bottom:22px;max-width:310px!important');
      db.setAttribute('style', 'max-width:340px!important;');
    }
  }, 2);
}

function _fill() {
  let tries = 300;
  const t = setInterval(() => {
    tries--;
    if (tries <= 0) { clearInterval(t); return; }
    const cf = _sr.querySelector('chat-pane#pane chat-form');
    if (cf?.shadowRoot) { clearInterval(t); _prefill(cf.shadowRoot); return; }
    const vf = _sr.querySelector('.lc_text-widget--form');
    if (vf) { clearInterval(t); _prefill(vf); return; }
  }, 10);
}

function _prefill(c) {
  try { c.querySelector('.lc_legal-text')?.remove(); } catch(e) {}
  if (!_fn || !_em) return;
  try {
    const n = c.querySelector('input[name="name"]');
    if (n) { n.value = (_fn+' '+_ln).trim(); n.dispatchEvent(new Event('input')); }
    const e = c.querySelector('input[name="email"]');
    if (e) { e.value = _em; e.dispatchEvent(new Event('input')); }
  } catch(e) {}
}

window.addEventListener('load', () => setTimeout(_waitWidget, 500));
</script>`;

  html = html.replace(/<\/body>/i, inject + '</body>');

  return {
    statusCode: 200,
    headers: {
      'Content-Type':    'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
      'Cache-Control':   'no-store',
    },
    body: html,
  };
};
