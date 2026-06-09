// src/App.jsx
import React, { useState, useEffect } from "react";
import { loadState, saveState, resetState } from "./lib/storage";
import Onboarding from "./components/Onboarding";
import Dashboard from "./components/Dashboard";
import PlanView from "./components/PlanView";
import CoachChat from "./components/CoachChat";
import RunsList from "./components/RunsList";
import {
  IconHome,
  IconPlan,
  IconChat,
  IconRuns,
  IconRunner,
} from "./components/Icons";

export default function App() {
  const [state, setState] = useState(loadState);
  const [tab, setTab] = useState("home");

  useEffect(() => {
    saveState(state);
  }, [state]);

  const update = (patch) => setState((s) => ({ ...s, ...patch }));

  // ----- Onboarding -----
  if (!state.profile) {
    return (
      <Onboarding
        onComplete={(profile) => {
          update({ profile });
          setTab("plan"); // porta subito alla generazione del piano
        }}
      />
    );
  }

  const toggleSession = (key) =>
    setState((s) => {
      const completed = { ...s.completed };
      if (completed[key]) delete completed[key];
      else completed[key] = true;
      return { ...s, completed };
    });

  const tabs = [
    { id: "home", label: "Oggi", Icon: IconHome },
    { id: "plan", label: "Piano", Icon: IconPlan },
    { id: "coach", label: "Coach", Icon: IconChat },
    { id: "runs", label: "Corse", Icon: IconRuns },
  ];

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
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (
              confirm(
                "Vuoi azzerare profilo, piano e dati? L'azione non è reversibile."
              )
            ) {
              resetState();
              setState(loadState());
              setTab("home");
            }
          }}
        >
          Reset
        </button>
      </div>

      {tab === "home" && (
        <Dashboard
          profile={state.profile}
          runs={state.runs}
          plan={state.plan}
          completed={state.completed}
          onToggle={toggleSession}
          onRuns={(runs) => update({ runs })}
          goTo={setTab}
        />
      )}

      {tab === "plan" && (
        <PlanView
          profile={state.profile}
          runs={state.runs}
          plan={state.plan}
          onPlan={(plan) => update({ plan, completed: {} })}
          completed={state.completed}
          onToggle={toggleSession}
        />
      )}

      {tab === "coach" && (
        <CoachChat
          profile={state.profile}
          runs={state.runs}
          plan={state.plan}
          chat={state.chat}
          onChat={(chat) => update({ chat })}
        />
      )}

      {tab === "runs" && (
        <RunsList runs={state.runs} onRuns={(runs) => update({ runs })} />
      )}

      <nav className="nav">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
