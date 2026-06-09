// src/components/PlanView.jsx
import React, { useState } from "react";
import { IconBolt, IconCheck } from "./Icons";
import { generatePlan } from "../lib/api";
import { summarizeRuns } from "../lib/healthParser";

function tagClass(tipo) {
  return "t-" + (tipo || "Facile").replace(/[^a-zA-Z]/g, "");
}

function Session({ s, weekNum, completed, toggle }) {
  const key = `${weekNum}-${s.giorno}-${s.titolo}`;
  const done = !!completed[key];
  const isRest = s.tipo === "Riposo";
  return (
    <div className={`session ${done ? "done" : ""}`}>
      <div className={`tag ${tagClass(s.tipo)}`}>
        <span className="d">{s.giorno}</span>
        <span style={{ fontSize: 10, opacity: 0.85 }}>{s.tipo}</span>
      </div>
      <div className="body">
        <div className="ttl">{s.titolo}</div>
        {!isRest && (
          <div className="meta">
            {s.distanzaKm ? `${s.distanzaKm} km` : ""}
            {s.durataMin ? ` · ${s.durataMin} min` : ""}
            {s.passoTarget ? ` · ${s.passoTarget}` : ""}
          </div>
        )}
        {s.descrizione && <div className="desc">{s.descrizione}</div>}
        {s.note && (
          <div className="faint" style={{ fontSize: 13, marginTop: 5 }}>
            💡 {s.note}
          </div>
        )}
      </div>
      {!isRest && (
        <button
          className={`check ${done ? "on" : ""}`}
          onClick={() => toggle(key)}
          aria-label="Segna come completato"
        >
          {done && <IconCheck style={{ width: 16, height: 16, color: "#06140b" }} />}
        </button>
      )}
    </div>
  );
}

export default function PlanView({ profile, runs, plan, onPlan, completed, onToggle }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function build() {
    setError("");
    setBusy(true);
    try {
      const summary = summarizeRuns(runs);
      const p = await generatePlan(profile, summary);
      onPlan(p);
    } catch (err) {
      setError(
        err.message?.includes("API key") || err.message?.includes("ANTHROPIC")
          ? err.message
          : "Non sono riuscito a generare il piano. Riprova tra un attimo. (" +
              err.message +
              ")"
      );
    } finally {
      setBusy(false);
    }
  }

  if (busy) {
    return (
      <div className="empty">
        <div className="spinner light" style={{ margin: "0 auto 18px", width: 32, height: 32 }} />
        <div className="display" style={{ fontSize: 26 }}>
          Il coach sta costruendo il tuo piano…
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Sto periodizzando i carichi sul tuo obiettivo. Pochi secondi.
        </p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="card center" style={{ padding: "34px 22px" }}>
        <div className="eyebrow">Il tuo programma</div>
        <h2 style={{ fontSize: 30, margin: "8px 0 10px" }}>
          Ancora nessun piano
        </h2>
        <p className="muted" style={{ marginBottom: 20 }}>
          Genera un programma di corsa dettagliato e periodizzato, costruito sul
          tuo obiettivo e (se li hai importati) sui tuoi dati reali.
        </p>
        <button className="btn btn-primary" onClick={build}>
          <IconBolt style={{ width: 18, height: 18 }} />
          Genera il piano con l'IA
        </button>
        {error && <div className="alert" style={{ marginTop: 14 }}>{error}</div>}
      </div>
    );
  }

  // progresso completamento
  const allRun = plan.settimane.flatMap((w) =>
    w.sessioni
      .filter((s) => s.tipo !== "Riposo")
      .map((s) => `${w.numero}-${s.giorno}-${s.titolo}`)
  );
  const doneCount = allRun.filter((k) => completed[k]).length;
  const pct = allRun.length ? Math.round((doneCount / allRun.length) * 100) : 0;

  return (
    <div className="fade-in">
      <div className="hero">
        <div className="eyebrow" style={{ position: "relative" }}>
          {plan.durataSettimane} settimane · obiettivo {plan.obiettivo}
        </div>
        <div className="quote" style={{ fontSize: 30, marginTop: 6 }}>
          {plan.titolo}
        </div>
        <div className="sub">{plan.introduzione}</div>
      </div>

      <div className="card" style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span className="cond" style={{ fontWeight: 700 }}>Avanzamento</span>
          <span className="cond" style={{ color: "var(--orange)", fontWeight: 700 }}>
            {doneCount}/{allRun.length} · {pct}%
          </span>
        </div>
        <div className="progress">
          <i style={{ width: `${pct}%` }} />
        </div>
        {plan.principi?.length > 0 && (
          <ul style={{ marginTop: 14, paddingLeft: 18, fontSize: 14 }} className="muted">
            {plan.principi.map((p, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{p}</li>
            ))}
          </ul>
        )}
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 14 }}
          onClick={build}
        >
          Rigenera piano
        </button>
      </div>

      {plan.settimane.map((w) => (
        <div key={w.numero}>
          <div className="week-head">
            <span className="wn">
              SETTIMANA <b>{w.numero}</b>
            </span>
            <span className="wk-km">
              {w.focus} · {w.kmTotali} km
            </span>
          </div>
          {w.sessioni.map((s, i) => (
            <Session
              key={i}
              s={s}
              weekNum={w.numero}
              completed={completed}
              toggle={onToggle}
            />
          ))}
        </div>
      ))}
      {error && <div className="alert" style={{ marginTop: 14 }}>{error}</div>}
    </div>
  );
}
