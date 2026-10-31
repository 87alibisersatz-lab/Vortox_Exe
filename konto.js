js
'use strict';

/*
  Sparkonto – ein allgemeines Konto, z. B. für dein Taschengeld.
  Es ist unabhängig von den Sparzielen.

  Diese Datei benutzt Hilfsfunktionen aus script.js
  (euro, datumFormat, parseBetrag, runde, neueId, esc, zeigeToast).
  Deshalb muss sie im HTML NACH script.js eingebunden werden.
*/

(function () {
  const KONTO_KEY = 'sparplaner-konto-v1';

  const form = document.getElementById('konto-form');
  const saldoEl = document.getElementById('konto-saldo');
  const anzahlEl = document.getElementById('konto-anzahl');
  const verlaufEl = document.getElementById('konto-verlauf');

  // Jede Buchung: { id, type: 'deposit' | 'withdraw', amount, note, date }
  let buchungen = laden();

  function laden() {
    try {
      const raw = localStorage.getItem(KONTO_KEY);
      const daten = raw ? JSON.parse(raw) : [];
      return Array.isArray(daten) ? daten : [];
    } catch {
      return [];
    }
  }

  function speichern() {
    try {
      localStorage.setItem(KONTO_KEY, JSON.stringify(buchungen));
    } catch {
      zeigeToast('Speichern im Browser ist nicht möglich.');
    }
  }

  function berechneSaldo(liste) {
    return runde(
      liste.reduce((s, b) => s + (b.type === 'deposit' ? b.amount : -b.amount), 0)
    );
  }

  function render() {
    saldoEl.textContent = euro.format(berechneSaldo(buchungen));
    anzahlEl.textContent = buchungen.length;

    if (buchungen.length === 0) {
      verlaufEl.innerHTML = '<li><span class="tx-info">Noch keine Einträge.</span></li>';
      return;
    }

    verlaufEl.innerHTML = [...buchungen]
      .reverse()
      .map((b) => {
        const plus = b.type === 'deposit';
        return `
          <li>
            <span class="tx-info">
              <span class="tx-date">${datumFormat.format(new Date(b.date))}</span>
              <span class="tx-note">${esc(b.note || (plus ? 'Einzahlung' : 'Auszahlung'))}</span>
            </span>
            <span class="${plus ? 'plus' : 'minus'}">${plus ? '+' : '−'}${euro.format(b.amount)}</span>
            <button class="icon-btn" data-id="${b.id}"
                    title="Eintrag löschen" aria-label="Eintrag löschen">✕</button>
          </li>`;
      })
      .join('');
  }

  // Einzahlen / Abheben
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const betrag = parseBetrag(form.elements.betrag.value);
    if (betrag === null) return zeigeToast('Bitte gib einen gültigen Betrag ein.');

    const art = e.submitter && e.submitter.value === 'withdraw' ? 'withdraw' : 'deposit';
    const stand = berechneSaldo(buchungen);

    if (art === 'withdraw' && betrag > stand) {
      return zeigeToast(`Auf deinem Sparkonto sind nur ${euro.format(stand)} – mehr kannst du nicht abheben.`);
    }

    buchungen.push({
      id: neueId(),
      type: art,
      amount: betrag,
      note: form.elements.notiz.value.trim(),
      date: new Date().toISOString(),
    });

    speichern();
    render();
    form.reset();
    zeigeToast(art === 'deposit' ? 'Einzahlung gespeichert ✔' : 'Auszahlung gespeichert ✔');
  });

  // Einzelnen Eintrag löschen
  verlaufEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;

    const rest = buchungen.filter((b) => b.id !== btn.dataset.id);
    if (berechneSaldo(rest) < 0) {
      return zeigeToast('Dieser Eintrag kann nicht gelöscht werden, sonst wäre dein Stand im Minus.');
    }

    buchungen = rest;
    speichern();
    render();
  });

  render();
})();