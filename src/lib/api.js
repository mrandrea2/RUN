// src/lib/api.js
// Chiamate alla serverless function /api/coach e prompt per il coach IA.

import { formatPace } from "./healthParser";

async function callCoach({ system, messages, max_tokens = 2000, temperature = 0.7 }) {
  const res = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages, max_tokens, temperature }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Errore nella richiesta al coach");
  return data.text;
}

// Riassume il profilo + storico per il prompt
function buildContext(profile, summary) {
  let ctx = `PROFILO ATLETA
- Obiettivo: ${profile.goal}${profile.goalDistance ? ` (${profile.goalDistance})` : ""}
- Data obiettivo: ${profile.targetDate || "non specificata"}
- Livello dichiarato: ${profile.level}
- Allenamenti desiderati a settimana: ${profile.daysPerWeek}
- Performance attuale: ${profile.currentPerf || "non specificata"}
- Volume settimanale attuale: ${profile.weeklyKm ? profile.weeklyKm + " km" : "non specificato"}
- Note/infortuni: ${profile.notes || "nessuna"}`;

  if (summary) {
    ctx += `

DATI REALI DA APPLE SALUTE (ultime ${summary.weeks} settimane)
- Corse totali: ${summary.totalRuns}
- Media corse/settimana: ${summary.runsPerWeek}
- Km totali: ${summary.totalKm}
- Corsa più lunga: ${summary.longestKm} km
- Passo medio: ${summary.avgPace ? formatPace(summary.avgPace) + " /km" : "n/d"}`;
  }
  return ctx;
}

// === GENERAZIONE DEL PIANO (JSON strutturato) ===
export async function generatePlan(profile, summary) {
  const context = buildContext(profile, summary);

  const system = `Sei un coach di corsa esperto, scienziato dello sport, che parla italiano.
Crei programmi di allenamento di corsa periodizzati, sicuri e progressivi, basati su evidenze.
Adatti il carico al livello reale dell'atleta e ai dati disponibili.
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, senza backtick markdown.

Schema JSON richiesto:
{
  "titolo": "string",
  "durataSettimane": number,
  "obiettivo": "string",
  "introduzione": "string (2-3 frasi motivanti e chiare)",
  "principi": ["string", "string", "string"],
  "settimane": [
    {
      "numero": number,
      "focus": "string breve",
      "kmTotali": number,
      "sessioni": [
        {
          "giorno": "Lun|Mar|Mer|Gio|Ven|Sab|Dom",
          "tipo": "Riposo|Facile|Lungo|Ripetute|Tempo|Fartlek|Recupero|Cross-training",
          "titolo": "string breve",
          "distanzaKm": number (0 se riposo),
          "durataMin": number,
          "passoTarget": "string es. 6:00/km o 'libero'",
          "descrizione": "string chiara su cosa fare",
          "note": "string consigli (riscaldamento, respiro, ecc.)"
        }
      ]
    }
  ]
}

Regole:
- Numero di sessioni di corsa a settimana = giorni desiderati dall'atleta; le altre giornate sono Riposo o Cross-training.
- Progressione realistica del volume (max +10% a settimana), con una settimana di scarico ogni 3-4.
- Se i dati Apple Salute mostrano un livello diverso da quello dichiarato, fidati dei dati reali e spiegalo nell'introduzione.
- Passi target coerenti con il passo medio reale dell'atleta.
- Genera tutte le settimane fino al raggiungimento dell'obiettivo (di norma 6-12 settimane).`;

  const userMsg = `Crea il piano per questo atleta:

${context}

Restituisci solo il JSON.`;

  const text = await callCoach({
    system,
    messages: [{ role: "user", content: userMsg }],
    max_tokens: 8000,
    temperature: 0.6,
  });

  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  const json = clean.slice(start, end + 1);
  return JSON.parse(json);
}

// === CHAT MOTIVAZIONALE ===
export async function coachReply(profile, summary, history, userMessage, plan) {
  const context = buildContext(profile, summary);
  const planNote = plan
    ? `\nL'atleta sta seguendo il piano "${plan.titolo}" (${plan.durataSettimane} settimane).`
    : "";

  const system = `Sei "Coach", l'allenatore di corsa personale dell'atleta. Parli italiano.
Sei caldo, diretto, energico e motivante — come un grande coach che crede davvero nei suoi atleti, senza essere sdolcinato.
Dai consigli pratici e concreti sulla corsa (tecnica, ritmo, recupero, alimentazione di base, gestione della fatica e della testa).
Rispondi in modo conciso (2-6 frasi), con un tono che dà carica. Usa il "tu". Non inventare dati medici: per dolori o infortuni consiglia un professionista.

CONTESTO ATLETA:
${context}${planNote}`;

  const messages = [
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  return callCoach({ system, messages, max_tokens: 600, temperature: 0.85 });
}

// === FRASE MOTIVAZIONALE DEL GIORNO ===
export async function dailyBoost(profile, nextSession) {
  const system = `Sei un coach di corsa motivazionale italiano. Genera UNA sola frase breve (max 18 parole), potente e originale, che dia carica all'atleta per il suo allenamento di oggi. Niente virgolette, niente emoji eccessive (max 1). Tono energico ma autentico.`;
  const sess = nextSession
    ? `Oggi: ${nextSession.tipo} — ${nextSession.titolo} (${nextSession.distanzaKm} km).`
    : `Oggi è un giorno di corsa.`;
  return callCoach({
    system,
    messages: [
      {
        role: "user",
        content: `Obiettivo dell'atleta: ${profile.goal}. ${sess} Dammi la frase.`,
      },
    ],
    max_tokens: 80,
    temperature: 1,
  });
}
