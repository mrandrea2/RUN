// src/components/Onboarding.jsx
import React, { useState } from "react";
import { IconRunner, IconBolt } from "./Icons";

const GOALS = [
  { key: "5K", label: "5 km", dist: "5K" },
  { key: "10K", label: "10 km", dist: "10K" },
  { key: "Mezza maratona", label: "Mezza", dist: "21K" },
  { key: "Maratona", label: "Maratona", dist: "42K" },
  { key: "Dimagrimento", label: "Dimagrire", dist: "" },
  { key: "Salute / fiato", label: "Salute & fiato", dist: "" },
];

const LEVELS = ["Principiante", "Intermedio", "Avanzato"];
const DAYS = [2, 3, 4, 5, 6];

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    goal: "10K",
    goalDistance: "10K",
    targetDate: "",
    level: "Intermedio",
    daysPerWeek: 3,
    currentPerf: "",
    weeklyKm: "",
    notes: "",
  });

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const steps = [
    // STEP 0 — obiettivo
    {
      eyebrow: "Passo 1 di 3",
      title: "Qual è il tuo obiettivo?",
      body: (
        <div className="chips">
          {GOALS.map((g) => (
            <button
              key={g.key}
              className={`chip ${f.goal === g.key ? "active" : ""}`}
              onClick={() => {
                set("goal", g.key);
                set("goalDistance", g.dist);
              }}
            >
              {g.label}
            </button>
          ))}
        </div>
      ),
      extra: (
        <label className="field" style={{ marginTop: 18 }}>
          <span className="label">Data obiettivo (facoltativa)</span>
          <input
            type="date"
            value={f.targetDate}
            onChange={(e) => set("targetDate", e.target.value)}
          />
        </label>
      ),
    },
    // STEP 1 — performance attuali
    {
      eyebrow: "Passo 2 di 3",
      title: "Dove sei adesso?",
      body: (
        <>
          <div style={{ marginBottom: 18 }}>
            <span className="label">Il tuo livello</span>
            <div className="chips">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  className={`chip ${f.level === l ? "active" : ""}`}
                  onClick={() => set("level", l)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span className="label">Performance attuale</span>
            <input
              type="text"
              placeholder="es. 10K in 55:00 — oppure corro 5K a fatica"
              value={f.currentPerf}
              onChange={(e) => set("currentPerf", e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Km che corri ora a settimana (circa)</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="es. 15"
              value={f.weeklyKm}
              onChange={(e) => set("weeklyKm", e.target.value)}
            />
          </label>
        </>
      ),
    },
    // STEP 2 — frequenza + note
    {
      eyebrow: "Passo 3 di 3",
      title: "Quanto ti alleni?",
      body: (
        <>
          <span className="label">Allenamenti di corsa a settimana</span>
          <div className="chips" style={{ marginBottom: 18 }}>
            {DAYS.map((d) => (
              <button
                key={d}
                className={`chip ${f.daysPerWeek === d ? "active" : ""}`}
                onClick={() => set("daysPerWeek", d)}
              >
                {d}×
              </button>
            ))}
          </div>
          <label className="field">
            <span className="label">Note, limiti o infortuni (facoltativo)</span>
            <textarea
              placeholder="es. fastidio al ginocchio, poco tempo il weekend…"
              value={f.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </label>
        </>
      ),
    },
  ];

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="mark">
            <IconRunner style={{ width: 20, height: 20, color: "var(--orange)" }} />
          </span>
          <span className="name">
            RUN<b>COACH</b> AI
          </span>
        </div>
      </div>

      <div className="hero">
        <div className="quote">
          PRONTO A <span className="hl">PARTIRE</span>?
        </div>
        <div className="sub">
          Rispondi a poche domande: il tuo coach IA costruirà un piano su misura.
        </div>
      </div>

      <div className="card fade-in" key={step}>
        <div className="eyebrow">{current.eyebrow}</div>
        <h2 style={{ fontSize: 32, margin: "6px 0 18px" }}>{current.title}</h2>
        {current.body}
        {current.extra}
      </div>

      <div className="progress" style={{ margin: "18px 2px" }}>
        <i style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>

      <div className="row">
        {step > 0 && (
          <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
            Indietro
          </button>
        )}
        {!last ? (
          <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
            Continua
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => onComplete(f)}
          >
            <IconBolt style={{ width: 18, height: 18 }} />
            Crea il mio piano
          </button>
        )}
      </div>
    </div>
  );
}
