

const BRANCHE_MAP = `
Klassifiziere die Branche des Unternehmens.
Verwende AUSSCHLIESSLICH einen dieser exakten Werte (Großschreibung beachten!):

- "Brautmoden"        → Brautmodengeschäft, Brautstudio, Brautkleider jeder Art, Hochzeitskleider, Brautaccessoires
- "Trauringe"         → Trauringgeschäft, Juwelier, Goldschmied, Eheringe, Verlobungsringe, Schmuck mit Hochzeitsfokus
- "Fotograf"          → Hochzeitsfotograf, Fotostudio mit Hochzeitsfokus
- "Videograf"         → Hochzeitsvideograf, Videoproduktion für Hochzeiten
- "Konditor"          → Konditorei, Bäckerei, Hochzeitstorten, Wedding Cakes, Candy Bar
- "Catering"          → Hochzeitscatering, Partyservice, Buffet, Menü für Hochzeiten
- "Hochzeitslocation" → Hochzeitslocation, Eventlocation, Schloss, Hotel, Scheune für Hochzeiten
- "Trauredner"        → Freier Redner, Trauzeuge, Zeremonienredner, Hochzeitsredner
- "Hochzeitsplaner"   → Wedding Planner, Hochzeitsorganisator, Eventmanager für Hochzeiten
- "Floristen"         → Florist, Blumengeschäft, Hochzeitsblumen, Brautstrauß, Tischdekoration
- "Default"           → Alles andere oder nicht eindeutig erkennbar

Wichtig:
- Gib NUR den exakten Wert zurück (z.B. "Floristen")
- Großschreibung exakt wie oben
- Niemals Variationen oder andere Formulierungen
- Im Zweifel: "Default"
`;

const VALID_BRANCHEN = [
  'Brautmoden', 'Trauringe', 'Fotograf', 'Videograf',
  'Konditor', 'Catering', 'Hochzeitslocation',
  'Trauredner', 'Hochzeitsplaner', 'Floristen', 'Default'
];

const RELEVANT_KEYWORDS = [
  'leistung', 'service', 'angebot', 'preis', 'kosten', 'tarif',
  'kontakt', 'contact', 'oeffnungszeit', 'zeiten', 'hours', 'erreichbar',
  'ueber', 'ueber-uns', 'about', 'team', 'wir', 'uns', 'philosophie',
  'kollektion', 'produkt', 'sortiment', 'marke', 'brand', 'hersteller',
  'traurin', 'braut', 'schmuck', 'ring', 'jewelry', 'hochzeit',
  'galerie', 'referenz', 'portfolio'
];

const IGNORE_EXTENSIONS = /\.(jpg|jpeg|png|gif|svg|webp|pdf|css|js|woff|ico|xml|zip)$/i;
const IGNORE_PATHS      = /\/(wp-admin|wp-login|feed|cart|checkout|login|register|cdn-cgi)/i;

function extractInternalLinks(html, baseUrl) {
  const base  = new URL(baseUrl);
  const links = new Set();
  const regex = /href=["']([^"'#?][^"']*)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const r = new URL(match[1], base.origin);
      if (
        r.hostname === base.hostname &&
        r.pathname !== '/' && r.pathname !== '' &&
        !IGNORE_EXTENSIONS.test(r.pathname) &&
        !IGNORE_PATHS.test(r.pathname)
      ) links.add(r.origin + r.pathname);
    } catch(e) {}
  }
  return [...links];
}

function scoreUrl(url) {
  const lower = url.toLowerCase();
  return RELEVANT_KEYWORDS.reduce((s, kw) => lower.includes(kw) ? s + 1 : s, 0);
}

async function jinaFetch(url, apiKey) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://r.jina.ai/' + url, {
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'text/plain', 'X-Timeout': '7' },
      signal: controller.signal
    });
    clearTimeout(t);
    if (!res.ok) return '';
    return (await res.text()).slice(0, 6000);
  } catch(e) { return ''; }
}

exports.handler = async function(event) {

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { url } = body;
  if (!url) return { statusCode: 400, body: JSON.stringify({ error: 'Missing url' }) };

  const JINA_KEY       = process.env.JINA_API_KEY;
  const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;

  const emptyResult = {
    beschreibung: '', leistungen: '', oeffnungszeiten: '',
    standort: '', besonderheiten: '', preise: '', marken: '', branche: 'Default'
  };

  try {
    // Schritt 1: Homepage HTML holen
    let homepageHtml = '';
    try {
      const c = new AbortController();
      setTimeout(() => c.abort(), 5000);
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: c.signal });
      homepageHtml = await r.text();
    } catch(e) {}

    // Schritt 2: Relevante Unterseiten erkennen
    const topSubpages = extractInternalLinks(homepageHtml, url)
      .map(link => ({ link, score: scoreUrl(link) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(x => x.link);

    // Schritt 3: Parallel scrapen
    const urlsToScrape = [url, ...topSubpages];
    const contents     = await Promise.all(urlsToScrape.map(u => jinaFetch(u, JINA_KEY)));

    // Schritt 4: Inhalte zusammenführen
    const combined = urlsToScrape
      .map((u, i) => contents[i] ? `\n\n=== SEITE: ${u} ===\n${contents[i]}` : '')
      .filter(Boolean).join('\n');

    if (!combined.trim()) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify(emptyResult)
      };
    }

    // Schritt 5: Claude extrahiert alle Felder inkl. Branche
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content:
`Du erhältst den kombinierten Text von bis zu 5 Seiten einer Unternehmenswebsite.
Extrahiere folgende Informationen als reines JSON — kein Markdown, keine Erklärungen.

Felder:
- beschreibung:    Kurze Beschreibung des Unternehmens (2–3 Sätze)
- leistungen:      Kommaseparierte Hauptleistungen
- oeffnungszeiten: Öffnungszeiten als Text, falls vorhanden
- standort:        Adresse oder Stadt, falls vorhanden
- besonderheiten:  Was macht dieses Unternehmen besonders (1–2 Sätze)
- preise:          Preisinformationen, falls vorhanden — sonst leer
- marken:          Marken oder Kollektionen, falls vorhanden — sonst leer
- branche:         ${BRANCHE_MAP}

Wenn eine Information nicht gefunden wird, leeren String zurückgeben.
Für "branche" immer einen der erlaubten Werte, niemals leer lassen.

Website-Inhalt:
${combined.slice(0, 28000)}`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    const rawText    = claudeData?.content?.[0]?.text || '{}';

    let extracted;
    try { extracted = JSON.parse(rawText); }
    catch(e) {
      const m = rawText.match(/\{[\s\S]*\}/);
      try { extracted = m ? JSON.parse(m[0]) : {}; } catch(e2) { extracted = {}; }
    }

    // Branche validieren — nur erlaubte Werte
    const rawBranche = (extracted.branche || '').trim();
    const branche    = VALID_BRANCHEN.includes(rawBranche) ? rawBranche : 'Default';

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beschreibung:    extracted.beschreibung    || '',
        leistungen:      extracted.leistungen      || '',
        oeffnungszeiten: extracted.oeffnungszeiten || '',
        standort:        extracted.standort        || '',
        besonderheiten:  extracted.besonderheiten  || '',
        preise:          extracted.preise          || '',
        marken:          extracted.marken          || '',
        branche
      })
    };

  } catch(e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
