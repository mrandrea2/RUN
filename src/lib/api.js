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
- Corsa piu lunga: ${summary.longestKm} km
- Passo medio: ${summary.avgPace ? formatPace(summary.avgPace) + " /km" : "n/d"}`;
  }
  return ctx;
}

/* =========================================================
   PARSING JSON ROBUSTO
   Gestisce: fence markdown, testo extra, virgole finali,
   e — soprattutto — JSON TRONCATO (chiude le strutture aperte).
   ========================================================= */
function extractJsonBlock(text) {
  let t = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = t.indexOf("{");
  if (start === -1) return t;
  const end = t.lastIndexOf("}");
  return end > start ? t.slice(start, end + 1) : t.slice(start);
}

// Ripara un JSON troncato chiudendo stringhe/array/oggetti rimasti aperti.
function repairTruncatedJson(s) {
  const stack = [];
  let inStr = false;
  let escaped = false;
  let result = "";

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    result += ch;
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }

  if (inStr) result += '"';
  result = result.replace(/,\s*$/, "");
  result = result.replace(/,\s*"[^"]*"\s*:\s*("[^"]*)?$/, "");

  for (let i = stack.length - 1; i >= 0; i--) {
    result += stack[i] === "{" ? "}" : "]";
  }
  return result;
}

function safeParsePlan(text) {
  const block = extractJsonBlock(text);

  try { return JSON.parse(block); } catch (_) {}
  try { return JSON.parse(block.replace(/,(\s*[}\]])/g, "$1")); } catch (_) {}
  try {
    const repaired = repairTruncatedJson(block).replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(repaired);
  } catch (e) {
    throw new Error("piano non interpretabile");
  }
}

// === GENERAZIONE DEL PIANO (JSON strutturato) ===
export async function generatePlan(profile, summary) {
  const context = buildContext(profile, summary);

  const system = `Sei un coach di corsa esperto, scienziato dello sport, che parli italiano.
Crei programmi di corsa periodizzati, sicuri e progressivi, basati su evidenze, adattati al livello reale dell'atleta.

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, senza backtick markdown, senza a capo dentro i valori stringa.

Schema:
{
  "titolo": "string breve",
  "durataSettimane": number,
  "obiettivo": "string",
  "introduzione": "string, max 2 frasi",
  "principi": ["string", "string", "string"],
  "settimane": [
    {
      "numero": number,
      "focus": "string brevissima",
      "kmTotali": number,
      "sessioni": [
        {
          "giorno": "Lun|Mar|Mer|Gio|Ven|Sab|Dom",
          "tipo": "Riposo|Facile|Lungo|Ripetute|Tempo|Fartlek|Recupero|Cross-training",
          "titolo": "string brevissima",
          "distanzaKm": number,
          "durataMin": number,
          "passoTarget": "string es. 6:00/km",
          "descrizione": "string max 15 parole",
          "note": "string max 12 parole"
        }
      ]
    }
  ]
}

REGOLE FERREE PER NON ECCEDERE LA LUNGHEZZA:
- Massimo 8 settimane totali (se l'obiettivo e lontano, copri le 8 settimane piu utili).
- "descrizione" max 15 parole, "note" max 12 parole, niente a capo dentro le stringhe.
- Sessioni di corsa a settimana = giorni desiderati; gli altri giorni Riposo o Cross-training (per il riposo metti distanzaKm 0 e durataMin 0).
- Progressione realistica (+10% max a settimana), una settimana di scarico ogni 3-4.
- Se i dati Apple Salute indicano un livello diverso da quello dichiarato, fidati dei dati reali.`;

  const userMsg = `Crea il piano per questo atleta. Rispetta i limiti di lunghezza. Restituisci SOLO il JSON.

${context}`;

  const text = await callCoach({
    system,
    messages: [{ role: "user", content: userMsg }],
    max_tokens: 8000,
    temperature: 0.5,
  });

  const plan = safeParsePlan(text);

  if (!plan || !Array.isArray(plan.settimane) || plan.settimane.length === 0) {
    throw new Error("piano vuoto");
  }
  plan.durataSettimane = plan.settimane.length;
  return plan;
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
Rispondi in modo conciso (2-6 frasi), con un tono che da carica. Usa il "tu". Non inventare dati medici: per dolori o infortuni consiglia un professionista.

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
    : `Oggi e un giorno di corsa.`;
  return callCoach({
    system,
    messages: [
      { role: "user", content: `Obiettivo dell'atleta: ${profile.goal}. ${sess} Dammi la frase.` },
    ],
    max_tokens: 80,
    temperature: 1,
  });
}
