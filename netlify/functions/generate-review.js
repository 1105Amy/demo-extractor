// Netlify Function: Generiert einen Bewertungstext mit Claude 3.5 Haiku
// Umgebungsvariable ANTHROPIC_API_KEY muss in Netlify gesetzt sein

export default async (req, context) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  try {
    const body = await req.json();
    const { wasGemacht, wasHilfreich, wasVerbessert, name } = body;

    if (!wasGemacht || !wasHilfreich || !wasVerbessert) {
      return new Response(
        JSON.stringify({ error: "Alle drei Antworten werden benötigt." }),
        { status: 400, headers }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API-Key nicht konfiguriert." }),
        { status: 500, headers }
      );
    }

    const systemPrompt = `Du bist ein Assistent, der aus Kundenantworten einen natürlichen, authentischen Google-Bewertungstext formuliert. Der Text soll in der Ich-Perspektive geschrieben sein, natürlich klingen und nicht wie Werbung wirken. Verwende die Informationen des Kunden und ergänze nur natürliche Verbindungsstücke. Der Text soll 3-5 Sätze lang sein. Schreibe auf Deutsch. Erfinde keine zusätzlichen Leistungen oder Ergebnisse, die der Kunde nicht genannt hat. Beende den Text mit einer kurzen Weiterempfehlung, aber ohne Übertreibung.`;

    const userMessage = `Formuliere aus diesen drei Antworten einen fertigen Google-Bewertungstext:

Was wurde gemacht?
${wasGemacht}

Was war besonders hilfreich?
${wasHilfreich}

Was hat sich dadurch verbessert?
${wasVerbessert}

${name ? `Name des Kunden: ${name}` : ""}

Schreibe den Text als zusammenhängenden Bewertungstext in der Ich-Perspektive. Keine Aufzählung, keine Überschriften, nur den fertigen Text.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Anthropic API error:", errorData);
      return new Response(
        JSON.stringify({ error: "Fehler bei der Textgenerierung." }),
        { status: 502, headers }
      );
    }

    const data = await response.json();
    const generatedText = data.content?.[0]?.text || "";

    return new Response(JSON.stringify({ text: generatedText.trim() }), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Function error:", error);
    return new Response(
      JSON.stringify({ error: "Ein unerwarteter Fehler ist aufgetreten." }),
      { status: 500, headers }
    );
  }
};
