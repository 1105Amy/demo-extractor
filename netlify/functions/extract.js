exports.handler = async (event) => {

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // URL aus GHL-Request lesen
  let url;
  try {
    url = JSON.parse(event.body).url;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  if (!url) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing url' }) };
  }

  // ── Schritt 1: Jina.ai scrapet die Website ─────────────────────────────
  let websiteContent;
  try {
    const jinaRes  = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'application/json' }
    });
    const jinaData = await jinaRes.json();
    websiteContent = jinaData.data?.content || jinaData.data?.text || '';
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Jina.ai failed: ' + e.message }) };
  }

  // ── Schritt 2: Claude extrahiert die Felder ─────────────────────────
  const prompt = `Extrahiere folgende Informationen aus diesem Website-Text und gib sie als JSON zur\u00fcck. Antworte NUR mit dem JSON-Objekt, ohne Erkl\u00e4rungen oder Markdown:

{
  "leistungen": "(Welche Produkte/Services werden angeboten?)",
  "beschreibung": "(2-3 S\u00e4tze \u00fcber das Studio)",
  "oeffnungszeiten": "(\u00d6ffnungszeiten wenn vorhanden, sonst: Termine nach Vereinbarung)",
  "standort": "(Stadt oder Adresse)",
  "besonderheiten": "(USPs, Alleinstellungsmerkmale)",
  "preise": "(Preisrahmen wenn erw\u00e4hnt, sonst leer lassen)",
  "marken": "(Angebotene Designer oder Marken, sonst leer lassen)"
}

Website-Inhalt:
${websiteContent.substring(0, 8000)}`; // Max 8000 Zeichen

  let extracted;
  try {
    const claudeRes  = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5',
        max_tokens: 1024,
        messages:   [{ role: 'user', content: prompt }]
      })
    });
    const claudeData = await claudeRes.json();
    const text       = claudeData.content?.[0]?.text || '';

    // JSON aus Antwort extrahieren (falls Claude doch Markdown hinzuf\u00fcgt)
    const match = text.match(/\{[\s\S]*\}/);
    extracted   = match ? JSON.parse(match[0]) : {};
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Claude failed: ' + e.message }) };
  }

  // ── Flaches JSON zur\u00fcckgeben → GHL kann alle Felder direkt lesen ──────────
  return {
    statusCode: 200,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(extracted)
  };
};
