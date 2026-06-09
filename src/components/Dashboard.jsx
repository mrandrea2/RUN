// src/components/Dashboard.jsx
import React, { useState, useEffect } from "react";
import { IconBolt, IconCheck, IconRunner } from "./Icons";
import { dailyBoost } from "../lib/api";
import { summarizeRuns, formatPace } from "../lib/healthParser";
import HealthImport from "./HealthImport";

const DAY_ORDER = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

// trova il "prossimo" allenamento non completato del piano
function nextSession(plan, completed) {
  if (!plan) return null;
  for (const w of plan.settimane) {
    for (const s of w.sessioni) {
      if (s.tipo === "Riposo") continue;
      const key = `${w.numero}-${s.giorno}-${s.titolo}`;
      if (!completed[key]) return { ...s, weekNum: w.numero, key };
    }
  }
  return null;
}

function tagClass(tipo) {
  return "t-" + (tipo || "Facile").replace(/[^a-zA-Z]/g, "");
}

export default function Dashboard({ profile, runs, plan, completed, onToggle, onRuns, goTo }) {
  const [boost, setBoost] = useState("");
  const next = nextSession(plan, completed);
  const summary = summarizeRuns(runs);

  useEffect(() => {
    let cancelled = false;
    const cached = sessionStorageSafe("boost");
    if (cached) {
      setBoost(cached);
      return;
    }
    dailyBoost(profile, next)
      .then((b) => {
        if (!cancelled && b) {
          setBoost(b.trim());
          sessionStorageSafe("boost", b.trim());
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fade-in stagger">
      <div className="hero">
        <div className="eyebrow" style={{ position: "relative" }}>
          Obiettivo · {profile.goal}
        </div>
        <div className="quote">
          {boost ? (
            <span dangerouslySetInnerHTML={{ __html: highlight(boost) }} />
          ) : (
            <>
              OGGI SI <span className="hl">CORRE</span>.
            </>
          )}
        </div>
        <div className="sub">
          {profile.daysPerWeek}× a settimana · livello {profile.level}
        </div>
      </div>

      {/* Prossimo allenamento */}
      {plan && next ? (
        <div className="card">
          <div className="eyebrow">Prossimo allenamento</div>
          <div className="session" style={{ marginTop: 12, marginBottom: 0 }}>
            <div className={`tag ${tagClass(next.tipo)}`}>
              <span className="d">{next.giorno}</span>
              <span style={{ fontSize: 10, opacity: 0.85 }}>{next.tipo}</span>
            </div>
            <div className="body">
              <div className="ttl">{next.titolo}</div>
              <div className="meta">
                {next.distanzaKm ? `${next.distanzaKm} km` : ""}
                {next.durataMin ? ` · ${next.durataMin} min` : ""}
                {next.passoTarget ? ` · ${next.passoTarget}` : ""}
              </div>
              {next.descrizione && <div className="desc">{next.descrizione}</div>}
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={() => onToggle(next.key)}
          >
            <IconCheck style={{ width: 18, height: 18 }} />
            Fatto! Segna come completato
          </button>
        </div>
      ) : plan && !next ? (
        <div className="card center" style={{ padding: "30px 20px" }}>
          <div className="display" style={{ fontSize: 30, color: "var(--orange)" }}>
            PIANO COMPLETATO 🏁
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            Hai finito tutte le sessioni. Genera un nuovo blocco dalla scheda
            Piano!
          </p>
        </div>
      ) : (
        <div className="card center" style={{ padding: "28px 20px" }}>
          <IconRunner
            style={{ width: 36, height: 36, color: "var(--orange)", margin: "0 auto 10px" }}
          />
          <div className="display" style={{ fontSize: 26 }}>
            Crea il tuo piano
          </div>
          <p className="muted" style={{ margin: "8px 0 16px" }}>
            Il coach IA è pronto a programmare la tua corsa nel dettaglio.
          </p>
          <button className="btn btn-primary" onClick={() => goTo("plan")}>
            <IconBolt style={{ width: 18, height: 18 }} />
            Vai al piano
          </button>
        </div>
      )}

      {/* Statistiche reali */}
      {summary && (
        <div className="card">
          <div className="eyebrow">I tuoi numeri reali</div>
          <div className="stat-grid" style={{ marginTop: 12 }}>
            <div className="stat">
              <div className="num">{summary.totalKm}</div>
              <div className="lab">Km (4 sett.)</div>
            </div>
            <div className="stat">
              <div className="num">{summary.runsPerWeek}</div>
              <div className="lab">Corse / sett.</div>
            </div>
            <div className="stat">
              <div className="num">{formatPace(summary.avgPace)}</div>
              <div className="lab">Passo /km</div>
            </div>
          </div>
        </div>
      )}

      {/* Import Apple Salute */}
      <HealthImport runs={runs} onRuns={onRuns} />
    </div>
  );
}

function highlight(text) {
  // evidenzia l'ultima parola "forte" — semplice tocco visivo
  const words = text.split(" ");
  if (words.length < 2) return escapeHtml(text);
  const lastTwo = words.slice(-2).join(" ");
  const rest = words.slice(0, -2).join(" ");
  return `${escapeHtml(rest)} <span class="hl">${escapeHtml(lastTwo)}</span>`;
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function sessionStorageSafe(key, val) {
  try {
    if (val !== undefined) {
      sessionStorage.setItem("rc-" + key, val);
      return val;
    }
    return sessionStorage.getItem("rc-" + key);
  } catch {
    return null;
  }
}
