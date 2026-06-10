// src/lib/healthParser.js
// Estrae le sessioni di CORSA dal file esportato da Apple Salute.
// Lo zip di Apple usa i "data descriptor": per leggerlo in modo affidabile
// usiamo fflate (JSZip falliva con "uncompressed data size mismatch").
// I nomi nell'export sono LOCALIZZATI (es. IT: esportazione/esportazione.xml),
// quindi non cerchiamo un nome fisso ma qualsiasi .xml utile.

import { unzip } from "fflate";

const RUN_TYPE = "HKWorkoutActivityTypeRunning";

function toKm(value, unit) {
  const v = parseFloat(value);
  if (isNaN(v)) return null;
  const u = (unit || "").toLowerCase();
  if (u === "km") return v;
  if (u === "mi") return v * 1.609344;
  if (u === "m") return v / 1000;
  return v;
}

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

function distanceFromStats(block) {
  const re =
    /<WorkoutStatistics[^>]*type="HKQuantityTypeIdentifierDistanceWalkingRunning"[^>]*>/g;
  let match;
  while ((match = re.exec(block)) !== null) {
    const sum = getAttr(match[0], "sum");
    const unit = getAttr(match[0], "unit");
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

export function parseWorkoutsFromXml(xml) {
  const runs = [];
  const workoutRe = /<Workout\b[^>]*?(?:\/>|>[\s\S]*?<\/Workout>)/g;
  let m;
  while ((m = workoutRe.exec(xml)) !== null) {
    const block = m[0];
    if (!block.includes(RUN_TYPE)) continue;

    const header = block.slice(0, block.indexOf(">") + 1);
    const startDate = getAttr(header, "startDate");
    const duration = getAttr(header, "duration");
    const durationUnit = getAttr(header, "durationUnit");

    let km = null;
    const totalDistance = getAttr(header, "totalDistance");
    if (totalDistance) km = toKm(totalDistance, getAttr(header, "totalDistanceUnit"));
    else km = distanceFromStats(block);

    const minutes = toMinutes(duration, durationUnit);
    if (!startDate || !minutes) continue;

    const date = new Date(startDate.replace(/ ([+-]\d)/, "$1").replace(/ /, "T"));
    const dist = km && km > 0 ? km : null;
    const paceMinPerKm = dist && minutes ? minutes / dist : null;

    runs.push({
      id: `${startDate}-${(dist || 0).toFixed(2)}`,
      date: isNaN(date.getTime()) ? new Date(startDate) : date,
      distanceKm: dist,
      durationMin: minutes,
      pace: paceMinPerKm,
      calories: energyFromStats(block),
      avgHr: hrFromStats(block),
    });
  }
  runs.sort((a, b) => b.date - a.date);
  return runs;
}

// Legge il file come ArrayBuffer (con fallback per Safari più vecchi)
function readArrayBuffer(file) {
  if (file.arrayBuffer) return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Lettura del file non riuscita"));
    r.readAsArrayBuffer(file);
  });
}

// Decomprime con fflate solo i file .xml dell'archivio
function unzipXmlFiles(uint8) {
  return new Promise((resolve, reject) => {
    unzip(
      uint8,
      { filter: (f) => /\.xml$/i.test(f.name) },
      (err, data) => (err ? reject(err) : resolve(data))
    );
  });
}

export async function parseHealthExport(file, onProgress) {
  const name = (file.name || "").toLowerCase();

  if (name.endsWith(".zip")) {
    onProgress?.("Apertura dell'archivio…");
    const buf = new Uint8Array(await readArrayBuffer(file));

    let files;
    try {
      files = await unzipXmlFiles(buf);
    } catch (e) {
      throw new Error(
        "Non riesco ad aprire questo archivio. Assicurati di caricare il file export.zip così com'è (senza rinominarlo o ricomprimerlo)."
      );
    }

    const names = Object.keys(files);
    if (names.length === 0) {
      throw new Error(
        "Nessun file XML nello zip. Carica l'archivio export.zip ottenuto da Salute (non altri file)."
      );
    }

    // preferisci i file NON clinici (*_cda.xml non ha gli allenamenti); poi il più grande
    names.sort((a, b) => {
      const ac = /cda/i.test(a) ? 1 : 0;
      const bc = /cda/i.test(b) ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return files[b].length - files[a].length;
    });

    onProgress?.("Lettura dei dati… (può richiedere qualche secondo)");
    const decoder = new TextDecoder("utf-8");

    let runs = [];
    let recognized = false;
    for (const n of names) {
      const txt = decoder.decode(files[n]);
      if (/<HealthData/i.test(txt)) recognized = true;
      if (!/<Workout/i.test(txt)) continue;
      onProgress?.("Estrazione delle corse…");
      const r = parseWorkoutsFromXml(txt);
      if (r.length) {
        runs = r;
        break;
      }
    }

    if (runs.length === 0 && !recognized) {
      throw new Error(
        "Non ho riconosciuto i dati di Salute nello zip. Scegli 'Esporta tutti i dati sanitari' e carica il file così com'è."
      );
    }
    return runs;
  }

  if (name.endsWith(".xml")) {
    onProgress?.("Lettura del file…");
    const txt = await file.text();
    onProgress?.("Estrazione delle corse…");
    return parseWorkoutsFromXml(txt);
  }

  throw new Error(
    "Formato non riconosciuto. Carica il file .zip (o .xml) esportato da Salute."
  );
}

export function summarizeRuns(runs, weeks = 4) {
  if (!runs || runs.length === 0) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);

  const recent = runs.filter((r) => r.date >= cutoff);
  const pool = recent.length ? recent : runs.slice(0, 12);

  const withDist = pool.filter((r) => r.distanceKm);
  const totalKm = withDist.reduce((s, r) => s + r.distanceKm, 0);
  const paces = withDist.filter((r) => r.pace).map((r) => r.pace);
  const avgPace = paces.length ? paces.reduce((s, p) => s + p, 0) / paces.length : null;
  const longest = withDist.reduce((max, r) => (r.distanceKm > max ? r.distanceKm : max), 0);

  return {
    totalRuns: pool.length,
    totalKm: Math.round(totalKm * 10) / 10,
    runsPerWeek: Math.round((pool.length / weeks) * 10) / 10,
    avgPace,
    longestKm: Math.round(longest * 10) / 10,
    weeks,
  };
}

export function formatPace(pace) {
  if (!pace || !isFinite(pace)) return "—";
  const min = Math.floor(pace);
  const sec = Math.round((pace - min) * 60);
  const s = sec === 60 ? 0 : sec;
  const mm = sec === 60 ? min + 1 : min;
  return `${mm}:${String(s).padStart(2, "0")}`;
}
