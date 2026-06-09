// src/lib/healthParser.js
// Estrae le sessioni di CORSA dal file esportato da Apple Salute.
// Apple esporta un export.zip che contiene export.xml (spesso molto grande).
// Per non far esplodere il browser non usiamo DOMParser sull'intero file:
// estraiamo solo i blocchi <Workout ...> di tipo Running con una scansione mirata.

import JSZip from "jszip";

const RUN_TYPE = "HKWorkoutActivityTypeRunning";

// Converte le distanze in km
function toKm(value, unit) {
  const v = parseFloat(value);
  if (isNaN(v)) return null;
  const u = (unit || "").toLowerCase();
  if (u === "km") return v;
  if (u === "mi") return v * 1.609344;
  if (u === "m") return v / 1000;
  return v; // assume km
}

// Converte la durata in minuti
function toMinutes(value, unit) {
  const v = parseFloat(value);
  if (isNaN(v)) return null;
  const u = (unit || "min").toLowerCase();
  if (u === "min") return v;
  if (u === "s" || u === "sec") return v / 60;
  if (u === "h" || u === "hr") return v * 60;
  return v;
}

function getAttr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

// Estrae la distanza dalle WorkoutStatistics figlie (formato iOS recente)
function distanceFromStats(block) {
  const re =
    /<WorkoutStatistics[^>]*type="HKQuantityTypeIdentifierDistanceWalkingRunning"[^>]*>/g;
  let match;
  while ((match = re.exec(block)) !== null) {
    const stat = match[0];
    const sum = getAttr(stat, "sum");
    const unit = getAttr(stat, "unit");
    if (sum) return toKm(sum, unit);
  }
  return null;
}

function energyFromStats(block) {
  const re =
    /<WorkoutStatistics[^>]*type="HKQuantityTypeIdentifierActiveEnergyBurned"[^>]*>/g;
  const match = re.exec(block);
  if (match) {
    const sum = getAttr(match[0], "sum");
    return sum ? Math.round(parseFloat(sum)) : null;
  }
  return null;
}

function hrFromStats(block) {
  const re =
    /<WorkoutStatistics[^>]*type="HKQuantityTypeIdentifierHeartRate"[^>]*>/g;
  const match = re.exec(block);
  if (match) {
    const avg = getAttr(match[0], "average");
    return avg ? Math.round(parseFloat(avg)) : null;
  }
  return null;
}

// Parsa la stringa XML estraendo solo le corse
export function parseWorkoutsFromXml(xml) {
  const runs = [];
  // Cattura sia <Workout .../> che <Workout ...>...</Workout>
  const workoutRe = /<Workout\b[^>]*?(?:\/>|>[\s\S]*?<\/Workout>)/g;
  let m;
  while ((m = workoutRe.exec(xml)) !== null) {
    const block = m[0];
    if (!block.includes(RUN_TYPE)) continue;

    const header = block.slice(0, block.indexOf(">") + 1);

    const startDate = getAttr(header, "startDate");
    const duration = getAttr(header, "duration");
    const durationUnit = getAttr(header, "durationUnit");

    // distanza: prima prova l'attributo legacy, poi le statistiche figlie
    let km = null;
    const totalDistance = getAttr(header, "totalDistance");
    if (totalDistance) {
      km = toKm(totalDistance, getAttr(header, "totalDistanceUnit"));
    } else {
      km = distanceFromStats(block);
    }

    const minutes = toMinutes(duration, durationUnit);

    if (!startDate || !minutes) continue;

    const date = new Date(startDate.replace(" +", "+").replace(/ /, "T"));
    const dist = km && km > 0 ? km : null;
    const paceMinPerKm =
      dist && minutes ? minutes / dist : null;

    runs.push({
      id: `${startDate}-${(dist || 0).toFixed(2)}`,
      date: isNaN(date.getTime()) ? new Date(startDate) : date,
      distanceKm: dist,
      durationMin: minutes,
      pace: paceMinPerKm, // min/km in decimale
      calories: energyFromStats(block),
      avgHr: hrFromStats(block),
    });
  }

  // ordina dal più recente
  runs.sort((a, b) => b.date - a.date);
  return runs;
}

// Punto d'ingresso: accetta File (.zip o .xml)
export async function parseHealthExport(file, onProgress) {
  const name = (file.name || "").toLowerCase();

  let xmlText = "";

  if (name.endsWith(".zip")) {
    onProgress?.("Apertura dell'archivio…");
    const zip = await JSZip.loadAsync(file);
    // Cerca export.xml (a volte è dentro apple_health_export/)
    let entry =
      zip.file("apple_health_export/export.xml") ||
      zip.file("export.xml");
    if (!entry) {
      // fallback: primo .xml grande trovato
      const xmls = zip.file(/export\.xml$/);
      entry = xmls && xmls.length ? xmls[0] : null;
    }
    if (!entry) {
      throw new Error(
        "Non ho trovato export.xml dentro lo zip. Assicurati di caricare il file esportato da Salute."
      );
    }
    onProgress?.("Lettura dei dati… (può richiedere qualche secondo)");
    xmlText = await entry.async("string");
  } else if (name.endsWith(".xml")) {
    onProgress?.("Lettura del file…");
    xmlText = await file.text();
  } else {
    throw new Error("Formato non riconosciuto. Carica un file .zip o .xml.");
  }

  onProgress?.("Estrazione delle corse…");
  const runs = parseWorkoutsFromXml(xmlText);
  return runs;
}

// Statistiche di sintesi sulle ultime N settimane
export function summarizeRuns(runs, weeks = 4) {
  if (!runs || runs.length === 0) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);

  const recent = runs.filter((r) => r.date >= cutoff);
  const pool = recent.length ? recent : runs.slice(0, 12);

  const withDist = pool.filter((r) => r.distanceKm);
  const totalKm = withDist.reduce((s, r) => s + r.distanceKm, 0);
  const paces = withDist.filter((r) => r.pace).map((r) => r.pace);
  const avgPace = paces.length
    ? paces.reduce((s, p) => s + p, 0) / paces.length
    : null;
  const longest = withDist.reduce(
    (max, r) => (r.distanceKm > max ? r.distanceKm : max),
    0
  );

  return {
    totalRuns: pool.length,
    totalKm: Math.round(totalKm * 10) / 10,
    runsPerWeek: Math.round((pool.length / weeks) * 10) / 10,
    avgPace,
    longestKm: Math.round(longest * 10) / 10,
    weeks,
  };
}

// Formatta un passo decimale (min/km) in "m:ss"
export function formatPace(pace) {
  if (!pace || !isFinite(pace)) return "—";
  const min = Math.floor(pace);
  const sec = Math.round((pace - min) * 60);
  const s = sec === 60 ? 0 : sec;
  const mm = sec === 60 ? min + 1 : min;
  return `${mm}:${String(s).padStart(2, "0")}`;
}
