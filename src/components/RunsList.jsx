// src/components/RunsList.jsx
import React from "react";
import { formatPace } from "../lib/healthParser";
import HealthImport from "./HealthImport";

function fmtDate(d) {
  return d.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function RunsList({ runs, onRuns }) {
  return (
    <div className="fade-in">
      <div className="hero" style={{ marginBottom: 14 }}>
        <div className="quote" style={{ fontSize: 28 }}>
          LE TUE <span className="hl">CORSE</span>
        </div>
        <div className="sub">
          {runs.length
            ? `${runs.length} corse importate da Apple Salute`
            : "Importa le tue corse per vederle qui"}
        </div>
      </div>

      <HealthImport runs={runs} onRuns={onRuns} />

      {runs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {runs.slice(0, 60).map((r) => (
            <div className="session" key={r.id}>
              <div className="tag t-Facile" style={{ width: 62 }}>
                <span style={{ fontSize: 12 }}>{fmtDate(r.date).split(" ")[0]}</span>
                <span className="d">{r.date.getDate()}</span>
              </div>
              <div className="body">
                <div className="ttl">
                  {r.distanceKm ? `${r.distanceKm.toFixed(2)} km` : "Corsa"}
                </div>
                <div className="meta">
                  {Math.round(r.durationMin)} min
                  {r.pace ? ` · ${formatPace(r.pace)}/km` : ""}
                  {r.avgHr ? ` · ${r.avgHr} bpm` : ""}
                  {r.calories ? ` · ${r.calories} kcal` : ""}
                </div>
              </div>
            </div>
          ))}
          {runs.length > 60 && (
            <p className="faint center" style={{ fontSize: 13, marginTop: 8 }}>
              …e altre {runs.length - 60} corse
            </p>
          )}
        </div>
      )}
    </div>
  );
}
