// src/lib/healthParser.js
// Estrae le sessioni di CORSA dal file esportato da Apple Salute.
//
// STRATEGIA (robusta su file di qualsiasi dimensione e sul formato Apple):
// 1. Leggiamo l'INDICE dello zip (central directory) -> ci dà l'offset del
//    file XML interno. La central directory è affidabile anche con i
//    "data descriptor" usati da Apple (dove i local header hanno size = 0).
// 2. Decomprimiamo SOLO quel file in VERO STREAMING (fflate Inflate),
//    leggendo lo zip a blocchi e scartando i dati man mano: la memoria resta
//    bassa anche con export da molti GB.
// 3. Estraiamo i blocchi <Workout> di corsa al volo.
//
// Se per qualunque motivo l'indice non è leggibile, c'è un fallback che
// decomprime l'archivio intero (ok per file di dimensioni normali).

import { Inflate, unzip } from "fflate";

export const PARSER_VERSION = "v7-zip64";

const RUN_TYPE = "HKWorkoutActivityTypeRunning";
const WORKOUT_RE = /<Workout\b[^>]*?(?:\/>|>[\s\S]*?<\/Workout>)/g;
const CHUNK = 8 * 1024 * 1024;

/* ---------- conversioni ---------- */
function toKm(v, unit) {
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  const u = (unit || "").toLowerCase();
  if (u === "mi") return n * 1.609344;
  if (u === "m") return n / 1000;
  return n; // km o sconosciuto
}
function toMinutes(v, unit) {
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  const u = (unit || "min").toLowerCase();
  if (u === "s" || u === "sec") return n / 60;
  if (u === "h" || u === "hr") return n * 60;
  return n;
}
function getAttr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}
function distanceFromStats(b) {
  const re = /<WorkoutStatistics[^>]*type="HKQuantityTypeIdentifierDistanceWalkingRunning"[^>]*>/g;
  let m;
  while ((m = re.exec(b)) !== null) { const s = getAttr(m[0], "sum"); if (s) return toKm(s, getAttr(m[0], "unit")); }
  return null;
}
function energyFromStats(b) {
  const m = /<WorkoutStatistics[^>]*type="HKQuantityTypeIdentifierActiveEnergyBurned"[^>]*>/.exec(b);
  if (m) { const s = getAttr(m[0], "sum"); return s ? Math.round(parseFloat(s)) : null; }
  return null;
}
function hrFromStats(b) {
  const m = /<WorkoutStatistics[^>]*type="HKQuantityTypeIdentifierHeartRate"[^>]*>/.exec(b);
  if (m) { const a = getAttr(m[0], "average"); return a ? Math.round(parseFloat(a)) : null; }
  return null;
}

function parseWorkoutBlock(block) {
  if (!block.includes(RUN_TYPE)) return null;
  const header = block.slice(0, block.indexOf(">") + 1);
  const startDate = getAttr(header, "startDate");
  const minutes = toMinutes(getAttr(header, "duration"), getAttr(header, "durationUnit"));
  if (!startDate || !minutes) return null;
  let km = null;
  const td = getAttr(header, "totalDistance");
  if (td) km = toKm(td, getAttr(header, "totalDistanceUnit"));
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

export function parseWorkoutsFromXml(xml) {
  const runs = [];
  WORKOUT_RE.lastIndex = 0;
  let m;
  while ((m = WORKOUT_RE.exec(xml)) !== null) { const r = parseWorkoutBlock(m[0]); if (r) runs.push(r); }
  runs.sort((a, b) => b.date - a.date);
  return runs;
}

/* ---------- scanner incrementale ---------- */
function createScanner(state) {
  let tail = "";
  let checked = false;
  return {
    push(text) {
      tail += text;
      if (!checked && tail.length > 256) { if (/<HealthData/i.test(tail.slice(0, 5000))) state.recognized = true; checked = true; }
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

/* ---------- lettura blocchi ---------- */
function sliceAB(file, start, end) {
  const blob = file.slice(start, Math.min(end, file.size));
  if (blob.arrayBuffer) return blob.arrayBuffer();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Lettura non riuscita"));
    r.readAsArrayBuffer(blob);
  });
}
const yieldUI = () => new Promise((r) => setTimeout(r, 0));

/* ---------- mini-lettore ZIP (central directory) ---------- */
// Trova l'End Of Central Directory e ritorna { cdOffset }
async function findCentralDirectory(file) {
  const tailLen = Math.min(file.size, 65557); // 22 + max comment 65535
  const buf = new Uint8Array(await sliceAB(file, file.size - tailLen, file.size));
  const dv = new DataView(buf.buffer);
  for (let i = buf.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      let cdOffset = dv.getUint32(i + 16, true);
      // ZIP64: se l'offset è saturato, cerca lo ZIP64 EOCD locator
      if (cdOffset === 0xffffffff && i >= 20) {
        if (dv.getUint32(i - 20, true) === 0x07064b50) {
          const z64Off = Number(dv.getBigUint64(i - 20 + 8, true));
          const z64 = new Uint8Array(await sliceAB(file, z64Off, z64Off + 56));
          const z64dv = new DataView(z64.buffer);
          if (z64dv.getUint32(0, true) === 0x06064b50) {
            cdOffset = Number(z64dv.getBigUint64(48, true));
          }
        }
      }
      return { cdOffset };
    }
  }
  throw new Error("NO_EOCD");
}

// Legge la central directory e ritorna le entry .xml non cliniche
async function readXmlEntries(file, cdOffset) {
  // la CD è in genere piccola: la leggiamo dall'offset fino a poco prima della fine
  const buf = new Uint8Array(await sliceAB(file, cdOffset, file.size));
  const dv = new DataView(buf.buffer);
  const entries = [];
  let p = 0;
  while (p + 46 <= buf.length && dv.getUint32(p, true) === 0x02014b50) {
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const uncompSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const diskStart = dv.getUint16(p + 34, true);
    let localOffset = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));

    // ZIP64: l'extra field 0x0001 contiene, NELL'ORDINE, solo i campi saturati:
    // uncompressedSize, compressedSize, localHeaderOffset, diskStart.
    if (
      compSize === 0xffffffff || uncompSize === 0xffffffff ||
      localOffset === 0xffffffff || diskStart === 0xffff
    ) {
      let ep = p + 46 + nameLen;
      const extraEnd = ep + extraLen;
      while (ep + 4 <= extraEnd) {
        const hid = dv.getUint16(ep, true);
        const hsz = dv.getUint16(ep + 2, true);
        if (hid === 0x0001) {
          let q = ep + 4;
          if (uncompSize === 0xffffffff) q += 8;
          if (compSize === 0xffffffff) q += 8;
          if (localOffset === 0xffffffff && q + 8 <= extraEnd) {
            localOffset = Number(dv.getBigUint64(q, true));
          }
          break;
        }
        ep += 4 + hsz;
      }
    }

    if (/\.xml$/i.test(name) && !/cda/i.test(name)) {
      entries.push({ name, method, localOffset });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// Calcola l'offset dei dati compressi leggendo il local header
async function dataStartOf(file, localOffset) {
  const hb = new Uint8Array(await sliceAB(file, localOffset, localOffset + 30));
  const dv = new DataView(hb.buffer);
  if (dv.getUint32(0, true) !== 0x04034b50) throw new Error("NO_LOCAL_HEADER");
  const nameLen = dv.getUint16(26, true);
  const extraLen = dv.getUint16(28, true);
  return localOffset + 30 + nameLen + extraLen;
}

// Streaming inflate del file scelto -> scanner
async function streamEntry(file, entry, state, onProgress) {
  const dataStart = await dataStartOf(file, entry.localOffset);
  const scanner = createScanner(state);
  const decoder = new TextDecoder("utf-8");
  const total = file.size;

  if (entry.method === 0) {
    // STORE (non compresso): leggiamo a blocchi e scansioniamo
    for (let off = dataStart; off < total; off += CHUNK) {
      const bytes = new Uint8Array(await sliceAB(file, off, off + CHUNK));
      const last = off + CHUNK >= total;
      scanner.push(decoder.decode(bytes, { stream: !last }));
      if (state.recognized && state.runs.length && last) break;
      onProgress?.(`Estrazione delle corse… ${Math.round(((off - dataStart) / (total - dataStart)) * 100)}%`);
      await yieldUI();
    }
    scanner.end();
    return;
  }

  // DEFLATE (method 8): inflate streaming
  // Blocchi piccoli + pause periodiche: l'output decompresso scorre a pezzi e
  // il garbage collector libera memoria, così il picco resta basso anche con
  // archivi molto comprimibili o molto grandi.
  const READ = 1 * 1024 * 1024; // 1MB letti dal disco per volta
  const PUSH = 64 * 1024;       // 64KB dati all'inflater per volta
  let done = false, failed = null, sinceYield = 0;
  const inflater = new Inflate();
  inflater.ondata = (chunk, final) => {
    scanner.push(decoder.decode(chunk, { stream: !final }));
    if (final) done = true;
  };

  for (let off = dataStart; off < total && !done; off += READ) {
    const block = new Uint8Array(await sliceAB(file, off, off + READ));
    const physicalLast = off + READ >= total;
    try {
      for (let p = 0; p < block.length && !done; p += PUSH) {
        const sub = block.subarray(p, Math.min(p + PUSH, block.length));
        const isLastSub = physicalLast && p + PUSH >= block.length;
        inflater.push(sub, isLastSub);
        if (++sinceYield >= 8) { sinceYield = 0; await yieldUI(); } // respiro per il GC
      }
    } catch (e) {
      failed = e;
      break;
    }
    onProgress?.(`Estrazione delle corse… ${Math.round(((off - dataStart) / Math.max(1, total - dataStart)) * 100)}%`);
    await yieldUI();
  }
  scanner.end();
  if (failed && state.runs.length === 0) throw failed;
}

/* ---------- fallback: decompressione intera (file normali) ---------- */
function unzipWhole(uint8) {
  return new Promise((resolve, reject) => {
    try {
      unzip(uint8, { filter: (f) => /\.xml$/i.test(f.name) && !/cda/i.test(f.name) },
        (err, data) => (err ? reject(err) : resolve(data)));
    } catch (e) { reject(e); }
  });
}

/* ---------- ingresso principale ---------- */
export async function parseHealthExport(file, onProgress) {
  const name = (file.name || "").toLowerCase();
  const state = { runs: [], seen: new Set(), recognized: false };

  if (name.endsWith(".zip")) {
    onProgress?.("Apertura dell'archivio…");

    // --- tentativo principale: streaming via central directory ---
    try {
      const { cdOffset } = await findCentralDirectory(file);
      const entries = await readXmlEntries(file, cdOffset);
      if (entries.length === 0) throw new Error("NO_XML");
      onProgress?.("Lettura dei dati…");
      for (const e of entries) {
        await streamEntry(file, e, state, onProgress);
        if (state.runs.length) break;
      }
      if (state.runs.length || state.recognized) {
        state.runs.sort((a, b) => b.date - a.date);
        return state.runs;
      }
    } catch (e) {
      // si passa al fallback
    }

    // --- fallback: decompressione intera SOLO per file piccoli ---
    // Su file grandi decomprimere tutto in RAM farebbe chiudere la pagina:
    // meglio un errore chiaro.
    if (file.size > 60 * 1024 * 1024) {
      throw new Error(
        "Non sono riuscito a leggere l'archivio in streaming e il file è troppo grande per aprirlo tutto in memoria. " +
        "Riprova: spesso basta ripetere il caricamento. Se persiste, scrivimi e troviamo un'alternativa."
      );
    }
    onProgress?.("Decompressione…");
    try {
      const buf = new Uint8Array(await (file.arrayBuffer ? file.arrayBuffer() : sliceAB(file, 0, file.size)));
      const files = await unzipWhole(buf);
      const names = Object.keys(files).sort((a, b) => files[b].length - files[a].length);
      const decoder = new TextDecoder("utf-8");
      for (const n of names) {
        const scanner = createScanner(state);
        const bytes = files[n];
        for (let off = 0; off < bytes.length; off += CHUNK) {
          const end = Math.min(off + CHUNK, bytes.length);
          scanner.push(decoder.decode(bytes.subarray(off, end), { stream: end < bytes.length }));
          await yieldUI();
        }
        scanner.end();
        delete files[n];
        if (state.runs.length) break;
      }
    } catch (e2) {
      throw new Error(
        "Non riesco ad aprire questo archivio. Verifica di aver caricato il file export.zip così com'è (senza rinominarlo o ricomprimerlo). Se il file è molto grande, riprova con una connessione stabile."
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
    for (let off = 0; off < file.size; off += CHUNK) {
      const ab = await sliceAB(file, off, off + CHUNK);
      const last = off + CHUNK >= file.size;
      scanner.push(decoder.decode(new Uint8Array(ab), { stream: !last }));
      onProgress?.(`Lettura del file… ${Math.round(((off + CHUNK) / file.size) * 100)}%`);
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
  const wd = pool.filter((r) => r.distanceKm);
  const totalKm = wd.reduce((s, r) => s + r.distanceKm, 0);
  const paces = wd.filter((r) => r.pace).map((r) => r.pace);
  const avgPace = paces.length ? paces.reduce((s, p) => s + p, 0) / paces.length : null;
  const longest = wd.reduce((mx, r) => (r.distanceKm > mx ? r.distanceKm : mx), 0);
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
