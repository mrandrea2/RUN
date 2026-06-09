# 🏃 RunCoach AI

Web app per allenarti con la corsa, con **coach IA** che crea la tua programmazione dettagliata, ti motiva e analizza i tuoi dati reali da **Apple Salute**.

Stack: **React + Vite** · **Vercel serverless function** come proxy per l'API Anthropic · `localStorage` (nessun database richiesto).

---

## ✨ Cosa fa

- **Onboarding**: imposti obiettivo (5K → maratona, dimagrimento, salute), performance attuali, livello e quanti allenamenti vuoi a settimana.
- **Piano IA**: genera un programma di corsa periodizzato e progressivo, settimana per settimana, con tipo di seduta, distanza, durata, passo target e note.
- **Import Apple Salute**: carichi l'`export.zip` esportato da Salute → l'app legge le tue corse (km, durata, passo, FC) e il coach usa i **dati reali** per tarare il piano.
- **Coach motivazionale**: chat con un coach IA che ti dà la carica e risponde ai tuoi dubbi.
- **Frase del giorno** e tracciamento dei completamenti.

---

## 🚀 Deploy in 4 passi

### 1. Carica su GitHub
Crea un nuovo repository su GitHub, poi dalla cartella del progetto:

```bash
git init
git add .
git commit -m "RunCoach AI"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/run-coach-ai.git
git push -u origin main
```

### 2. Importa su Vercel
- Vai su [vercel.com](https://vercel.com) → **Add New → Project** → importa il repo.
- Framework preset: **Vite** (rilevato in automatico).

### 3. Aggiungi la API key (passaggio fondamentale)
In Vercel → **Settings → Environment Variables**, aggiungi:

| Name | Value |
|------|-------|
| `ANTHROPIC_API_KEY` | la tua chiave `sk-ant-...` |

> La chiave resta **solo sul server** (la serverless function `api/coach.js`). Non arriva mai al browser.

### 4. Deploy
Vercel fa il build da solo. Fine 🎉

---

## 💻 Sviluppo in locale

```bash
npm install
npm run dev
```

Per far funzionare il coach IA anche in locale serve l'API key. Due opzioni:
- usa la **Vercel CLI**: `npm i -g vercel` → `vercel dev` (legge le env del progetto), oppure
- crea un file `.env` con `ANTHROPIC_API_KEY=sk-ant-...` se usi `vercel dev`.

> Con il semplice `npm run dev` (Vite) la rotta `/api/coach` non è attiva: usa `vercel dev` per testare anche l'IA.

---

## 📲 Come esportare i dati da Apple Salute

Su iPhone: app **Salute** → tocca la **foto profilo** in alto a destra → **Esporta tutti i dati sanitari** → ottieni `export.zip`. Caricalo nell'app (scheda *Oggi* o *Corse*).

---

## 🎨 Personalizzazione

- Colori e font: `src/styles.css` (variabili in `:root`).
- Modello IA: costante `MODEL` in `api/coach.js`.
- Prompt del coach (piano, chat, motivazione): `src/lib/api.js`.

---

Preparato da Andrea Bertelli · Human Performance Lab
