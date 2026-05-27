

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

exports.handler = async function(event) {
  const params    = event.queryStringParameters || {};
  const targetUrl = params.url;
  const email     = params.email   || '';
  const vorname   = params.vorname || '';
  const name      = params.name    || '';
  const branche   = params.branche || 'Brautmoden';
  const widgetId  = BRANCHE_WIDGETS[branche] || BRANCHE_WIDGETS.Brautmoden;

  if (!targetUrl) {
    return { statusCode: 400, body: 'Missing url parameter' };
  }

  let response;
  try {
    response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });
  } catch (e) {
    return { statusCode: 502, body: 'Failed to fetch: ' + e.message };
  }

  let html = await response.text();

  // ── Base-Tag für relative URLs ──
  try {
    const base = new URL(targetUrl);
    const baseTag = `<base href="${base.origin}/">`;
    html = html.replace(/<head>/i, '<head>' + baseTag);
  } catch(e) {}

  // ── Viewport auf Mobile-Breite erzwingen (iPhone-Layout) ──
  const viewportTag = '<meta name="viewport" content="width=390, initial-scale=1">';
  if (/<meta[^>]*name=["']viewport["'][^>]*>/i.test(html)) {
    html = html.replace(/<meta[^>]*name=["']viewport["'][^>]*>/i, viewportTag);
  } else {
    html = html.replace(/<head>/i, '<head>' + viewportTag);
  }

  // ── Widget + Cookie-Unterdrückung + Auto-Fill + Positioning ──
  const widgetScript = `
<script>
(function() {

  // Cookie Banner unterdrücken
  var style = document.createElement('style');
  style.textContent = [
    '[class*="cookie"], [id*="cookie"]',
    '[class*="consent"], [id*="consent"]',
    '[class*="gdpr"], [id*="gdpr"]',
    '.cc-window, #cookiebanner',
    '.cookie-notice, .cookie-popup, .cookie-bar'
  ].join(', ') + ' { display: none !important; }';
  document.head.appendChild(style);

  // Kontaktdaten für Auto-Fill
  window.__ghl_contact = {
    email: "${email}",
    firstName: "${vorname}",
    lastName: "${name}"
  };

  // Widget laden
  (function(d, t) {
    var g = d.createElement(t), s = d.getElementsByTagName(t)[0];
    g.src = 'https://widgets.leadconnectorhq.com/loader.js';
    g.setAttribute('data-resources-url', 'https://widgets.leadconnectorhq.com/');
    g.setAttribute('data-widget-id', '${widgetId}');
    s.parentNode.insertBefore(g, s);
  })(document, 'script');

  // Widget-Positionierung im Phone-Mockup
  function _setSize() {
    var w = document.querySelector('lc-widget-container');
    if (w) {
      w.style.cssText += 'right:50px;bottom:22px;max-width:310px;';
      var p = w.querySelector('.lc-chat-panel');
      if (p) p.style.maxWidth = '340px';
    }
    setTimeout(_setSize, 500);
  }
  _setSize();

})();
<\/script>`;

  if (html.includes('</body>')) {
    html = html.replace('</body>', widgetScript + '</body>');
  } else if (html.includes('</html>')) {
    html = html.replace('</html>', widgetScript + '</html>');
  } else {
    html += widgetScript;
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': "frame-ancestors *",
    },
    body: html,
  };
};

