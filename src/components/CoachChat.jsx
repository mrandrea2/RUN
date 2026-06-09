// src/components/CoachChat.jsx
import React, { useState, useRef, useEffect } from "react";
import { IconSend } from "./Icons";
import { coachReply } from "../lib/api";
import { summarizeRuns } from "../lib/healthParser";

const SUGGESTIONS = [
  "Non ho voglia di allenarmi oggi…",
  "Come gestisco il fiato in salita?",
  "Ho saltato due allenamenti, e ora?",
  "Dammi una carica per il lungo di domani",
];

export default function CoachChat({ profile, runs, plan, chat, onChat }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, busy]);

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setError("");
    setInput("");
    const newChat = [...chat, { role: "user", content: msg }];
    onChat(newChat);
    setBusy(true);
    try {
      const summary = summarizeRuns(runs);
      const reply = await coachReply(profile, summary, chat, msg, plan);
      onChat([...newChat, { role: "assistant", content: reply }]);
    } catch (err) {
      setError("Il coach non risponde in questo momento. Riprova.");
      onChat(newChat);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in">
      <div className="hero" style={{ marginBottom: 14 }}>
        <div className="quote" style={{ fontSize: 28 }}>
          PARLA COL TUO <span className="hl">COACH</span>
        </div>
        <div className="sub">
          Dubbi, cali di motivazione, consigli sul ritmo: scrivi pure. È qui per
          te.
        </div>
      </div>

      <div className="chat-wrap">
        {chat.length === 0 && (
          <>
            <div className="bubble coach">
              Ehi {profile.goal ? "" : ""}! Sono il tuo coach. 💪 Pronto a
              spingere verso {profile.goal}? Chiedimi quello che vuoi, o tocca un
              suggerimento qui sotto.
            </div>
            <div className="chips" style={{ marginTop: 4 }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`bubble ${m.role === "user" ? "me" : "coach"}`}>
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="bubble coach">
            <span className="spinner light" style={{ display: "inline-block" }} />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && <div className="alert" style={{ marginTop: 12 }}>{error}</div>}

      <div className="chat-input">
        <input
          type="text"
          placeholder="Scrivi al coach…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          className="btn btn-primary"
          style={{ width: "auto", padding: "0 18px" }}
          onClick={() => send()}
          disabled={busy}
        >
          <IconSend style={{ width: 20, height: 20 }} />
        </button>
      </div>
    </div>
  );
}
