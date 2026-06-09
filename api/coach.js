// api/coach.js
// Serverless function (Vercel) che fa da proxy verso l'API Anthropic.
// La chiave NON arriva mai al browser: vive solo in process.env.ANTHROPIC_API_KEY.

export const config = { maxDuration: 60 };

const MODEL = "claude-sonnet-4-6";

export default async function handler(req, res) {
  // CORS di base (utile in locale / preview)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo non consentito" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        "ANTHROPIC_API_KEY non configurata. Aggiungila nelle Environment Variables di Vercel.",
    });
  }

  try {
    const { system, messages, max_tokens = 2000, temperature = 0.7 } =
      req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Campo 'messages' mancante." });
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens,
        temperature,
        ...(system ? { system } : {}),
        messages,
      }),
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      return res.status(anthropicRes.status).json({
        error: data?.error?.message || "Errore dall'API Anthropic",
      });
    }

    const text = (data.content || [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n");

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Errore interno" });
  }
}
