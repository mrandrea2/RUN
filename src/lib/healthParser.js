// src/lib/healthParser.js
// Estrae le sessioni di CORSA dal file esportato da Apple Salute.
//
// PUNTI CHIAVE:
// - Lo zip di Apple usa i "data descriptor": lo leggiamo con fflate (streaming).
// - L'export può essere ENORME (anche GB decompressi): per non saturare la
//   memoria di Safari/iPhone NON carichiamo mai l'XML intero. Decomprimiamo a
//   blocchi, estraiamo i blocchi <Workout> completi e scartiamo il resto.
// - I nomi dei file sono LOCALIZZATI (IT: esportazione/esportazione.xml),
//   quindi accettiamo qualsiasi .xml non clinico (escludiamo *_cda.xml).

import { Unzip, UnzipInflate } from "fflate";

const RUN_TYPE = "HKWorkoutActivityTypeRunning";
const WORKOUT_RE = /<Workout\b[^>]*?(?:\/>|>[\s\S]*?<\/Workout>)/g;
const READ_CHUNK = 8 * 1024 * 1024; // leggiamo il file a blocchi da 8MB

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

/* ---------- parsing di un singolo blocco <Workout> ---------- */
function parseWorkoutBlock(block) {
  if (!block.includes(RUN_TYPE)) return null;

  const header = block.slice(0, block.indexOf(">") + 1);
  const startDate = getAttr(header, "startDate");
  const duration = getAttr(header, "duration");
  const durationUnit = getAttr(header, "durationUnit");

  let km = null;
  const totalDistance = getAttr(header, "totalDistance");
  if (totalDistance) km = toKm(totalDistance, getAttr(header, "totalDistanceUnit"));
  else km = distanceFromStats(block);

  const minutes = toMinutes(duration, durationUnit);
  if (!startDate || !minutes) return null;

  const date = new Date(startDate.replace(/ ([+-]\d)/, "$1").replace(/ /, "T"));
  const dist = km && km > 0 ? km : null;
  const paceMinPerKm = dist && minutes ? minutes / dist : null;

  return {
    id: `${startDate}-${(dist || 0).toFixed(2)}`,
    date: isNaN(date.getTime()) ? new Date(startDate) : date,
    distanceKm: dist,
    durationMin: minutes,
    pace: paceMinPerKm,
    calories: energyFromStats(block),
    avgHr: hrFromStats(block),
  };
}

// Compatibilità: parsing di una stringa XML completa (usato per file piccoli/test)
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

/* ---------- scanner incrementale ----------
   Riceve testo a pezzi, estrae i blocchi <Workout> COMPLETI e tiene in un
   piccolo buffer solo l'eventuale blocco rimasto aperto a cavallo dei chunk. */
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
      let m;
      let lastEnd = 0;
      while ((m = WORKOUT_RE.exec(tail)) !== null) {
        lastEnd = m.index + m[0].length;
        const r = parseWorkoutBlock(m[0]);
        if (r && !state.seen.has(r.id)) {
          state.seen.add(r.id);
          state.runs.push(r);
        }
      }

      // tieni solo ciò che può ancora servire:
      // dall'inizio di un eventuale <Workout ancora aperto, oppure pochi byte
      // di coda per gestire un tag spezzato tra due chunk.
      let rest = tail.slice(lastEnd);
      const idx = rest.indexOf("<Workout");
      tail = idx === -1 ? rest.slice(-64) : rest.slice(idx);

      // valvola di sicurezza: un blocco aperto non può crescere all'infinito
      if (tail.length > 4_000_000) tail = tail.slice(-256);
    },
    end() {
      this.push("");
      tail = "";
    },
  };
}

/* ---------- lettura file a blocchi ---------- */
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

const yieldUI = () => new Promise((r) => setTimeout(r, 0));

/* ---------- ingresso principale ---------- */
export async function parseHealthExport(file, onProgress) {
  const name = (file.name || "").toLowerCase();
  const state = { runs: [], seen: new Set(), recognized: false };

  if (name.endsWith(".zip")) {
    onProgress?.("Apertura dell'archivio…");

    const unzipper = new Unzip();
    unzipper.register(UnzipInflate);

    let entryError = null;
    unzipper.onfile = (f) => {
      // solo XML non clinici (il *_cda.xml non contiene gli allenamenti)
      if (!/\.xml$/i.test(f.name) || /cda/i.test(f.name)) return;
      const decoder = new TextDecoder("utf-8");
      const scanner = createScanner(state);
      f.ondata = (err, data, final) => {
        if (err) {
          entryError = err;
          return;
        }
        scanner.push(decoder.decode(data, { stream: !final }));
        if (final) scanner.end();
      };
      f.start();
    };

    try {
      for (let off = 0; off < file.size; off += READ_CHUNK) {
        const ab = await sliceBuffer(file, off, off + READ_CHUNK);
        const isLast = off + READ_CHUNK >= file.size;
        unzipper.push(new Uint8Array(ab), isLast);
        const pct = Math.min(100, Math.round(((off + READ_CHUNK) / file.size) * 100));
        onProgress?.(`Lettura dei dati… ${pct}%`);
        await yieldUI(); // lascia respirare l'interfaccia su file grandi
      }
    } catch (e) {
      throw new Error(
        "Non riesco ad aprire questo archivio. Carica il file export.zip così com'è (senza rinominarlo o ricomprimerlo)."
      );
    }

    if (state.runs.length === 0 && entryError && !state.recognized) {
      throw new Error(
        "Errore nella decompressione dei dati. Riprova a esportare da Salute e ricarica il file."
      );
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
    for (let off = 0; off < file.size; off += READ_CHUNK) {
      const ab = await sliceBuffer(file, off, off + READ_CHUNK);
      const isLast = off + READ_CHUNK >= file.size;
      scanner.push(decoder.decode(new Uint8Array(ab), { stream: !isLast }));
      const pct = Math.min(100, Math.round(((off + READ_CHUNK) / file.size) * 100));
      onProgress?.(`Lettura del file… ${pct}%`);
      await yieldUI();
    }
    scanner.end();
    state.runs.sort((a, b) => b.date - a.date);
    return state.runs;
  }

  throw new Error(
    "Formato non riconosciuto. Carica il file .zip (o .xml) esportato da Salute."
  );
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
