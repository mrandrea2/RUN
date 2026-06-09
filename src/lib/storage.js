// src/lib/storage.js
// Persistenza locale su localStorage (nessun backend richiesto).

const KEY = "runcoach-ai-state-v1";

const DEFAULT_STATE = {
  profile: null, // dati onboarding
  plan: null, // piano generato dall'IA
  runs: [], // corse importate da Apple Salute
  chat: [], // cronologia chat motivazionale
  completed: {}, // { "settimana-giorno": true }
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    // ridà vita alle date delle corse
    if (parsed.runs) {
      parsed.runs = parsed.runs.map((r) => ({ ...r, date: new Date(r.date) }));
    }
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Impossibile salvare lo stato:", e);
  }
}

export function resetState() {
  localStorage.removeItem(KEY);
}
