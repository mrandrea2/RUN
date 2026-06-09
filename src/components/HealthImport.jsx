// src/components/HealthImport.jsx
import React, { useRef, useState } from "react";
import { IconUpload } from "./Icons";
import { parseHealthExport, summarizeRuns, formatPace } from "../lib/healthParser";

export default function HealthImport({ runs, onRuns }) {
  const fileRef = useRef(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const summary = summarizeRuns(runs);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const parsed = await parseHealthExport(file, setStatus);
      if (parsed.length === 0) {
        setError(
          "Nessuna corsa trovata nel file. Hai esportato i dati da Salute? (Salute → tua foto profilo → Esporta tutti i dati sanitari)"
        );
      } else {
        onRuns(parsed);
        setStatus(`Importate ${parsed.length} corse 🎉`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="card">
      <div className="eyebrow">Apple Salute</div>
      <h3 style={{ fontSize: 24, margin: "4px 0 10px" }}>
        Importa le tue corse
      </h3>

      {summary ? (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat">
              <div className="num">{summary.totalRuns}</div>
              <div className="lab">Corse</div>
            </div>
            <div className="stat">
              <div className="num">{summary.totalKm}</div>
              <div className="lab">Km totali</div>
            </div>
            <div className="stat">
              <div className="num">{formatPace(summary.avgPace)}</div>
              <div className="lab">Passo /km</div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>
            Media di <b>{summary.runsPerWeek}</b> corse a settimana · longest run{" "}
            <b>{summary.longestKm} km</b>. Questi dati reali guidano il piano del
            coach.
          </p>
        </>
      ) : (
        <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>
          Su iPhone: app <b>Salute</b> → tocca la tua foto in alto a destra →{" "}
          <b>Esporta tutti i dati sanitari</b>. Ottieni un file{" "}
          <b>export.zip</b>: caricalo qui sotto.
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".zip,.xml"
        onChange={handleFile}
        style={{ display: "none" }}
      />
      <button
        className="btn btn-ghost"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? (
          <span className="spinner light" />
        ) : (
          <IconUpload style={{ width: 18, height: 18 }} />
        )}
        {busy ? "Elaboro…" : runs.length ? "Aggiorna dati" : "Carica export.zip"}
      </button>

      {status && !error && (
        <p className="faint" style={{ fontSize: 13, marginTop: 10 }}>
          {status}
        </p>
      )}
      {error && (
        <div className="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
