'use strict';

/* ---------- Grundeinstellungen ---------- */

const STORAGE_KEY = 'sparplaner-daten-v1';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const datumFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/* ---------- Elemente ---------- */

const els = {
  goalForm: document.getElementById('goal-form'),
  goalName: document.getElementById('goal-name'),
  goalEmoji: document.getElementById('goal-emoji'),
  goalTarget: document.getElementById('goal-target'),
  goalStart: document.getElementById('goal-start'),
  goalDeadline: document.getElementById('goal-deadline'),
  goals: document.getElementById('goals'),
  sumSaved: document.getElementById('sum-saved'),
  sumTarget: document.getElementById('sum-target'),
  sumPercent: document.getElementById('sum-percent'),
  sumBar: document.getElementById('sum-bar'),
  toast: document.getElementById('toast'),
};

/* ---------- Daten ---------- */
/*
  Struktur:
  goals = [
    {
      id, name, emoji, target, deadline (oder null),
      transactions: [ { id, type: 'deposit' | 'withdraw', amount, note, date } ]
    }
  ]
*/

let goals = laden();
const offeneVerlaeufe = new Set(); // merkt sich, welche Verläufe aufgeklappt sind

function laden() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function speichern() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  } catch {
    zeigeToast('Speichern im Browser ist nicht möglich.');
  }
}

/* ---------- Hilfsfunktionen ---------- */

function neueId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function runde(zahl) {
  return Math.round(zahl * 100) / 100;
}

/** Wandelt Eingaben wie "12,50", "1.500,00" oder "1500" in eine Zahl um. */
function parseBetrag(text) {
  let t = String(text).replace(/\s|€/g, '');
  if (!t) return null;

  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ''); // "1.500" = tausendfünfhundert
  }

  const zahl = Number(t);
  if (!Number.isFinite(zahl) || zahl <= 0 || zahl > 1e9) return null;
  return runde(zahl);
}

function gespart(ziel) {
  const summe = ziel.transactions.reduce(
    (s, t) => s + (t.type === 'deposit' ? t.amount : -t.amount),
    0
  );
  return runde(summe);
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

let toastTimer;
function zeigeToast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3200);
}

function fristInfo(ziel, rest, erreicht) {
  if (erreicht) return '🎉 Ziel erreicht – Glückwunsch!';
  if (!ziel.deadline) return '';

  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const ende = new Date(ziel.deadline + 'T00:00:00');
  const tage = Math.round((ende - heute) / 86400000);
  const datum = datumFormat.format(ende);

  if (tage < 0) return `⚠️ Die Frist (${datum}) ist abgelaufen.`;
  if (tage === 0) return `📅 Die Frist endet heute (${datum}).`;

  const monate = Math.max(1, Math.ceil(tage / 30.44));
  return `📅 Bis ${datum} (noch ${tage} Tage) · ca. ${euro.format(rest / monate)} pro Monat`;
}

/* ---------- Anzeige ---------- */

function render() {
  renderUebersicht();
  renderZiele();
}

function renderUebersicht() {
  const summeGespart = goals.reduce((s, g) => s + Math.max(0, gespart(g)), 0);
  const summeZiele = goals.reduce((s, g) => s + g.target, 0);
  const prozent = summeZiele > 0 ? Math.min(100, Math.floor((summeGespart / summeZiele) * 100)) : 0;

  els.sumSaved.textContent = euro.format(summeGespart);
  els.sumTarget.textContent = euro.format(summeZiele);
  els.sumPercent.textContent = prozent + ' %';
  els.sumBar.style.width = prozent + '%';
}

function renderZiele() {
  if (goals.length === 0) {
    els.goals.innerHTML =
      '<p class="empty">Noch keine Sparziele vorhanden. Lege oben dein erstes Ziel an! 🚀</p>';
    return;
  }
  els.goals.innerHTML = goals.map(kartenHtml).join('');
}

function kartenHtml(g) {
  const saved = gespart(g);
  const erreicht = saved >= g.target;
  const prozent = erreicht ? 100 : Math.max(0, Math.floor((saved / g.target) * 100));
  const rest = Math.max(0, runde(g.target - saved));
  const offen = offeneVerlaeufe.has(g.id) ? 'open' : '';

  const verlauf = [...g.transactions]
    .reverse()
    .map((t) => {
      const plus = t.type === 'deposit';
      return `
        <li>
          <span class="tx-info">
            <span class="tx-date">${datumFormat.format(new Date(t.date))}</span>
            <span class="tx-note">${esc(t.note || (plus ? 'Einzahlung' : 'Auszahlung'))}</span>
          </span>
          <span class="${plus ? 'plus' : 'minus'}">${plus ? '+' : '−'}${euro.format(t.amount)}</span>
          <button class="icon-btn" data-action="delete-tx" data-goal="${g.id}" data-tx="${t.id}"
                  title="Eintrag löschen" aria-label="Eintrag löschen">✕</button>
        </li>`;
    })
    .join('');

  return `
    <article class="card goal ${erreicht ? 'done' : ''}">
      <div class="goal-head">
        <h3>${esc(g.emoji)} ${esc(g.name)}</h3>
        <button class="icon-btn" data-action="delete-goal" data-id="${g.id}"
                title="Ziel löschen" aria-label="Ziel ${esc(g.name)} löschen">🗑️</button>
      </div>

      <div class="amounts">
        <strong>${euro.format(saved)}</strong>
        <span>von ${euro.format(g.target)}</span>
      </div>

      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${prozent}">
        <div class="progress-bar" style="width:${prozent}%"></div>
      </div>

      <p class="meta">
        <span>${prozent} %</span>
        <span>${erreicht ? '' : 'Noch ' + euro.format(rest)}</span>
      </p>
      <p class="info">${fristInfo(g, rest, erreicht)}</p>

      <form class="tx-form" data-id="${g.id}" autocomplete="off">
        <input type="text" name="betrag" inputmode="decimal" placeholder="Betrag in €" aria-label="Betrag in Euro" required>
        <input type="text" name="notiz" maxlength="60" placeholder="Notiz (optional)" aria-label="Notiz">
        <div class="tx-buttons">
          <button type="submit" value="deposit" class="btn primary">＋ Einzahlen</button>
          <button type="submit" value="withdraw" class="btn ghost">－ Abheben</button>
        </div>
      </form>

      <details data-id="${g.id}" ${offen}>
        <summary>Verlauf (${g.transactions.length})</summary>
        ${verlauf ? `<ul class="history">${verlauf}</ul>` : '<p class="info">Noch keine Einträge.</p>'}
      </details>
    </article>`;
}

/* ---------- Aktionen ---------- */

// Neues Ziel anlegen
els.goalForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const name = els.goalName.value.trim();
  const target = parseBetrag(els.goalTarget.value);
  if (!name) return zeigeToast('Bitte gib dem Ziel einen Namen.');
  if (target === null) return zeigeToast('Bitte gib einen gültigen Zielbetrag ein.');

  const startRaw = els.goalStart.value.trim();
  let start = 0;
  if (startRaw) {
    start = parseBetrag(startRaw);
    if (start === null) return zeigeToast('Der Betrag bei „Schon gespart“ ist ungültig.');
  }

  const ziel = {
    id: neueId(),
    name,
    emoji: els.goalEmoji.value,
    target,
    deadline: els.goalDeadline.value || null,
    transactions: [],
  };

  if (start > 0) {
    ziel.transactions.push({
      id: neueId(),
      type: 'deposit',
      amount: start,
      note: 'Startbetrag',
      date: new Date().toISOString(),
    });
  }

  goals.push(ziel);
  speichern();
  render();
  els.goalForm.reset();
  zeigeToast('Sparziel angelegt ✔');
});

// Einzahlen / Abheben
els.goals.addEventListener('submit', (e) => {
  const form = e.target.closest('.tx-form');
  if (!form) return;
  e.preventDefault();

  const ziel = goals.find((g) => g.id === form.dataset.id);
  if (!ziel) return;

  const betrag = parseBetrag(form.elements.betrag.value);
  if (betrag === null) return zeigeToast('Bitte gib einen gültigen Betrag ein.');

  const art = e.submitter && e.submitter.value === 'withdraw' ? 'withdraw' : 'deposit';
  const vorher = gespart(ziel);

  if (art === 'withdraw' && betrag > vorher) {
    return zeigeToast(`Du hast nur ${euro.format(vorher)} gespart – mehr kannst du nicht abheben.`);
  }

  ziel.transactions.push({
    id: neueId(),
    type: art,
    amount: betrag,
    note: form.elements.notiz.value.trim(),
    date: new Date().toISOString(),
  });

  speichern();
  render();

  if (vorher < ziel.target && gespart(ziel) >= ziel.target) {
    zeigeToast('🎉 Glückwunsch, dein Ziel ist erreicht!');
  } else {
    zeigeToast(art === 'deposit' ? 'Einzahlung gespeichert ✔' : 'Auszahlung gespeichert ✔');
  }
});

// Löschen (Ziel oder einzelner Eintrag)
els.goals.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  if (btn.dataset.action === 'delete-goal') {
    const ziel = goals.find((g) => g.id === btn.dataset.id);
    if (!ziel) return;
    if (!confirm(`Das Ziel „${ziel.name}“ wirklich löschen?`)) return;
    goals = goals.filter((g) => g.id !== ziel.id);
    offeneVerlaeufe.delete(ziel.id);
    speichern();
    render();
  }

  if (btn.dataset.action === 'delete-tx') {
    const ziel = goals.find((g) => g.id === btn.dataset.goal);
    if (!ziel) return;
    const rest = ziel.transactions.filter((t) => t.id !== btn.dataset.tx);
    const neuerStand = gespart({ transactions: rest });
    if (neuerStand < 0) {
      return zeigeToast('Dieser Eintrag kann nicht gelöscht werden, sonst wäre dein Stand im Minus.');
    }
    ziel.transactions = rest;
    speichern();
    render();
  }
});

// Aufgeklappten Verlauf merken
els.goals.addEventListener(
  'toggle',
  (e) => {
    const details = e.target;
    if (!(details instanceof HTMLDetailsElement)) return;
    if (details.open) offeneVerlaeufe.add(details.dataset.id);
    else offeneVerlaeufe.delete(details.dataset.id);
  },
  true
);

/* ---------- Start ---------- */

// Frist-Datum darf nicht in der Vergangenheit liegen (lokales Datum, Format JJJJ-MM-TT)
els.goalDeadline.min = new Date().toLocaleDateString('sv-SE');

render();
