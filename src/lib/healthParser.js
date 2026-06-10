// src/lib/healthParser.js
// Estrae le sessioni di CORSA dal file esportato da Apple Salute.
//
// PUNTI CHIAVE:
// - Lo zip di Apple usa i "data descriptor". Per leggerlo correttamente usiamo
//   fflate unzip() (NON la modalità streaming Unzip, che NON supporta i data
//   descriptor): unzip() legge la central directory, dove le dimensioni sono
//   sempre corrette, e può girare in un Web Worker senza bloccare la UI.
// - Per tenere bassa la memoria NON creiamo un'unica stringa gigante: facciamo
//   lo scan dei blocchi <Workout> a finestre sul buffer decompresso.
// - I nomi sono LOCALIZZATI (IT: esportazione/esportazione.xml): accettiamo
//   qualsiasi .xml non clinico (escludiamo *_cda.xml).

import { unzip } from "fflate";

const RUN_TYPE = "HKWorkoutActivityTypeRunning";
const WORKOUT_RE = /<Workout\b[^>]*?(?:\/>|>[\s\S]*?<\/Workout>)/g;
const SCAN_WIN = 4 * 1024 * 1024; // finestra di scansione 4MB

/* ---------- conversioni ---------- */
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
  const re = /<WorkoutStatistics[^>]*type="HKQuantityTypeIdentifierDistanceWalkingRunning"[^>]*>/g;
  let match;
  while ((match = re.exec(block)) !== null) {
    const sum = getAttr(match[0], "sum");
    if (sum) return toKm(sum, getAttr(match[0], "unit"));
  }
  return null;
}
function energyFromStats(block) {
  const m = /<WorkoutStatistics[^>]*type="HKQuantityTypeIdentifierActiveEnergyBurned"[^>]*>/.exec(block);
  if (m) { const sum = getAttr(m[0], "sum"); return sum ? Math.round(parseFloat(sum)) : null; }
  return null;
}
function hrFromStats(block) {
  const m = /<WorkoutStatistics[^>]*type="HKQuantityTypeIdentifierHeartRate"[^>]*>/.exec(block);
  if (m) { const avg = getAttr(m[0], "average"); return avg ? Math.round(parseFloat(avg)) : null; }
  return null;
}

/* ---------- parsing di un singolo blocco <Workout> ---------- */
function parseWorkoutBlock(block) {
  if (!block.includes(RUN_TYPE)) return null;
  const header = block.slice(0, block.indexOf(">") + 1);
  const startDate = getAttr(header, "startDate");
  const duration = getAttr(header, "duration");
  const minutes = toMinutes(duration, getAttr(header, "durationUnit"));
  if (!startDate || !minutes) return null;

  let km = null;
  const totalDistance = getAttr(header, "totalDistance");
  if (totalDistance) km = toKm(totalDistance, getAttr(header, "totalDistanceUnit"));
  else km = distanceFromStats(block);

  const date = new Date(startDate.replace(/ ([+-]\d)/, "$1").replace(/ /, "T"));
  const dist = km && km > 0 ? km : null;
  return {
    id: `${startDate}-${(dist || 0).toFixed(2)}`,
    date: isNaN(date.getTime()) ? new Date(startDate) : date,
    distanceKm: dist,
    durationMin: minutes,
    pace: dist && minutes ? minutes / dist : null,
    calories: energyFromStats(block),
    avgHr: hrFromStats(block),
  };
}

// Parsing di una stringa XML completa (file piccoli / test)
export function parseWorkoutsFromXml(xml) {
  const runs = [];
  WORKOUT_RE.lastIndex = 0;
  let m;
  while ((m = WORKOUT_RE.exec(xml)) !== null) {
    const r = parseWorkoutBlock(m[0]);
    if (r) runs.push(r);
  }
  runs.sort((a, b) => b.date - a.date);
  return runs;
}

/* ---------- scanner incrementale (a finestre) ---------- */
function createScanner(state) {
  let tail = "";
  let headerChecked = false;
  return {
    push(text) {
      tail += text;
      if (!headerChecked && tail.length > 256) {
        if (/<HealthData/i.test(tail.slice(0, 5000))) state.recognized = true;
        headerChecked = true;
      }
      WORKOUT_RE.lastIndex = 0;
      let m, lastEnd = 0;
      while ((m = WORKOUT_RE.exec(tail)) !== null) {
        lastEnd = m.index + m[0].length;
        const r = parseWorkoutBlock(m[0]);
        if (r && !state.seen.has(r.id)) { state.seen.add(r.id); state.runs.push(r); }
      }
      const rest = tail.slice(lastEnd);
      const idx = rest.indexOf("<Workout");
      tail = idx === -1 ? rest.slice(-64) : rest.slice(idx);
      if (tail.length > 4_000_000) tail = tail.slice(-256);
    },
    end() { this.push(""); tail = ""; },
  };
}

/* ---------- lettura a blocchi dal file (per .xml diretti) ---------- */
function sliceBuffer(file, start, end) {
  const blob = file.slice(start, end);
  if (blob.arrayBuffer) return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Lettura del file non riuscita"));
    r.readAsArrayBuffer(blob);
  });
}
function readWholeBuffer(file) {
  if (file.arrayBuffer) return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Lettura del file non riuscita"));
    r.readAsArrayBuffer(file);
  });
}
const yieldUI = () => new Promise((r) => setTimeout(r, 0));

// Decomprime SOLO gli .xml non clinici leggendo la central directory (gestisce
// i data descriptor di Apple). Gira in Web Worker quando disponibile.
function unzipXml(uint8) {
  return new Promise((resolve, reject) => {
    try {
      unzip(
        uint8,
        { filter: (f) => /\.xml$/i.test(f.name) && !/cda/i.test(f.name) },
        (err, data) => (err ? reject(err) : resolve(data))
      );
    } catch (e) {
      reject(e);
    }
  });
}

// Scansiona un buffer di byte (XML decompresso) a finestre
async function scanBytes(bytes, state, onProgress, label) {
  const decoder = new TextDecoder("utf-8");
  const scanner = createScanner(state);
  for (let off = 0; off < bytes.length; off += SCAN_WIN) {
    const end = Math.min(off + SCAN_WIN, bytes.length);
    const isLast = end >= bytes.length;
    scanner.push(decoder.decode(bytes.subarray(off, end), { stream: !isLast }));
    const pct = Math.min(100, Math.round((end / bytes.length) * 100));
    onProgress?.(`${label} ${pct}%`);
    await yieldUI();
  }
  scanner.end();
}

/* ---------- ingresso principale ---------- */
export async function parseHealthExport(file, onProgress) {
  const name = (file.name || "").toLowerCase();
  const state = { runs: [], seen: new Set(), recognized: false };

  if (name.endsWith(".zip")) {
    onProgress?.("Apertura dell'archivio…");
    let buf;
    try {
      buf = new Uint8Array(await readWholeBuffer(file));
    } catch (e) {
      throw new Error("Non riesco a leggere il file. Riprova a selezionarlo.");
    }

    onProgress?.("Decompressione…");
    let files;
    try {
      files = await unzipXml(buf);
    } catch (e) {
      throw new Error(
        "Non riesco ad aprire questo archivio. Carica il file export.zip così com'è (senza rinominarlo o ricomprimerlo)."
      );
    }
    buf = null; // libera lo zip compresso

    const names = Object.keys(files);
    if (names.length === 0) {
      throw new Error(
        "Nessun file XML utile nello zip. Scegli 'Esporta tutti i dati sanitari' e carica il file così com'è."
      );
    }
    // dal più grande (l'export principale) ai più piccoli
    names.sort((a, b) => files[b].length - files[a].length);

    for (const n of names) {
      await scanBytes(files[n], state, onProgress, "Estrazione delle corse…");
      delete files[n]; // libera memoria man mano
      if (state.runs.length) break;
    }

    if (state.runs.length === 0 && !state.recognized) {
      throw new Error(
        "Non ho riconosciuto i dati di Salute nello zip. Scegli 'Esporta tutti i dati sanitari' e carica il file così com'è."
      );
    }
    state.runs.sort((a, b) => b.date - a.date);
    return state.runs;
  }

  if (name.endsWith(".xml")) {
    const decoder = new TextDecoder("utf-8");
    const scanner = createScanner(state);
    for (let off = 0; off < file.size; off += SCAN_WIN) {
      const ab = await sliceBuffer(file, off, off + SCAN_WIN);
      const isLast = off + SCAN_WIN >= file.size;
      scanner.push(decoder.decode(new Uint8Array(ab), { stream: !isLast }));
      const pct = Math.min(100, Math.round(((off + SCAN_WIN) / file.size) * 100));
      onProgress?.(`Lettura del file… ${pct}%`);
      await yieldUI();
    }
    scanner.end();
    state.runs.sort((a, b) => b.date - a.date);
    return state.runs;
  }

  throw new Error("Formato non riconosciuto. Carica il file .zip (o .xml) esportato da Salute.");
}

/* ---------- statistiche ---------- */
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
