'use strict';

// ============================================
// TERITORIILE MELE
// Listă locală de teritorii pentru predicare, cu navigare rapidă pe hartă.
// Depinde de: state.myTerritories (storage.js), saveState(), escHtml(),
// showToast(), formatDate() și helper-ele ICS (icsExport.js).
// ============================================

const TERRITORY_STATUS_LABELS = {
  'neinceput': 'Neînceput',
  'in-lucru': 'În lucru',
  'terminat': 'Terminat',
};

function makeTerritoryId() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 7);
}

function territoryTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function territoryDateOnly(dateStr) {
  if (!dateStr) return '';
  return String(dateStr).slice(0, 10);
}

function addMonthsSafe(dateStr, months) {
  const [y, m, d] = territoryDateOnly(dateStr).split('-').map(Number);
  if (!y || !m || !d) return null;
  const targetMonthIndex = (m - 1) + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(targetYear, targetMonth, Math.min(d, lastDay), 9, 0, 0);
}

function formatIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getTerritoryReceivedDate(territory) {
  return territoryDateOnly(territory.receivedDate) || territoryDateOnly(territory.createdAt) || territoryTodayIso();
}

function getTerritoryDueInfo(territory) {
  const receivedDate = getTerritoryReceivedDate(territory);
  const dueDate = addMonthsSafe(receivedDate, 4);
  if (!dueDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(dueDate);
  dueDay.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((dueDay - today) / 86400000);
  return { receivedDate, dueDate, dueIso: formatIsoDate(dueDate), daysLeft };
}

function normalizeMyTerritories() {
  if (!Array.isArray(state.myTerritories)) state.myTerritories = [];
}

function addMyTerritory() {
  normalizeMyTerritories();

  const nameEl = document.getElementById('territoryName');
  const areaEl = document.getElementById('territoryArea');
  const statusEl = document.getElementById('territoryStatus');
  const receivedDateEl = document.getElementById('territoryReceivedDate');
  const lastVisitEl = document.getElementById('territoryLastVisit');
  const notesEl = document.getElementById('territoryNotes');
  const today = territoryTodayIso();

  const territory = {
    id: makeTerritoryId(),
    name: (nameEl?.value || '').trim(),
    area: (areaEl?.value || '').trim(),
    status: statusEl?.value || 'neinceput',
    receivedDate: receivedDateEl?.value || today,
    lastVisit: lastVisitEl?.value || '',
    notes: (notesEl?.value || '').trim(),
    createdAt: new Date().toISOString(),
  };

  if (!territory.name && !territory.area) {
    showToast('Completează cel puțin numele sau zona teritoriului.', 'error');
    return;
  }

  state.myTerritories.push(territory);
  saveState();

  if (nameEl) nameEl.value = '';
  if (areaEl) areaEl.value = '';
  if (statusEl) statusEl.value = 'neinceput';
  if (receivedDateEl) receivedDateEl.value = today;
  if (lastVisitEl) lastVisitEl.value = '';
  if (notesEl) notesEl.value = '';

  renderMyTerritoriesPage();
  showToast('Teritoriu adăugat! 🗺️', 'success');
}

function updateMyTerritory(id, field, value) {
  normalizeMyTerritories();
  const territory = state.myTerritories.find(t => t.id === id);
  if (!territory) return;
  territory[field] = value;
  saveStateDebounced();
}

function updateMyTerritoryAndRender(id, field, value) {
  updateMyTerritory(id, field, value);
  flushPendingSave();
  renderMyTerritoriesPage();
}

function deleteMyTerritory(id) {
  if (!confirm('Ștergi acest teritoriu?')) return;
  normalizeMyTerritories();
  state.myTerritories = state.myTerritories.filter(t => t.id !== id);
  saveState();
  renderMyTerritoriesPage();
  showToast('Teritoriu șters.', 'success');
}

function openTerritoryMap(id) {
  normalizeMyTerritories();
  const territory = state.myTerritories.find(t => t.id === id);
  if (!territory) return;

  const url = getTerritoryMapUrl(territory);
  if (!url) {
    showToast('Adaugă o adresă sau zonă pentru navigare.', 'error');
    return;
  }

  window.open(url, '_blank');
}

function getTerritoryMapUrl(territory) {
  const query = [territory.area, territory.name].map(v => (v || '').trim()).filter(Boolean).join(', ');
  if (!query) {
    return '';
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildMyTerritoriesCalendar() {
  normalizeMyTerritories();
  const active = state.myTerritories.filter(t => (t.status || 'neinceput') !== 'terminat');
  if (active.length === 0) return null;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudiuMeu//Teritoriile Mele//RO',
    'CALSCALE:GREGORIAN',
  ];

  active.forEach((territory, index) => {
    const dueInfo = getTerritoryDueInfo(territory);
    if (!dueInfo) return;

    const start = dueInfo.dueDate;
    const end = new Date(start.getTime() + 60 * 60000);
    const title = (territory.name || territory.area || 'Teritoriu').trim();
    const place = (territory.area || '').trim();
    const summary = `Predare teritoriu: ${title}`;
    const description = [
      'Se împlinesc 4 luni de când ții acest teritoriu.',
      'Anunță predarea lui sau verifică dacă trebuie prelungit.',
      place ? `Zonă/adresă: ${place}` : '',
      territory.notes ? `Notițe: ${territory.notes}` : '',
    ].filter(Boolean).join('\n');
    const uid = `studiumeu-teritoriu-${territory.id || index}@studiumeu.local`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${icsFormatDate(new Date())}Z`,
      `DTSTART:${icsFormatDate(start)}`,
      `DTEND:${icsFormatDate(end)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      'BEGIN:VALARM',
      'TRIGGER:-P7D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape('Peste o săptămână se împlinesc 4 luni pentru: ' + title)}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape('Mâine se împlinesc 4 luni pentru: ' + title)}`,
      'END:VALARM',
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  return { ics: lines.join('\r\n'), count: active.length };
}

function exportMyTerritoriesCalendar() {
  const result = buildMyTerritoriesCalendar();
  if (!result) {
    showToast('Nu există teritorii active pentru export în calendar.', 'error');
    return;
  }

  const blob = new Blob([result.ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'teritoriile-mele-predare-4-luni.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Calendar exportat (${result.count} teritorii active) 📅`, 'success');
}

function renderMyTerritoriesPage() {
  normalizeMyTerritories();
  const list = document.getElementById('myTerritoriesList');
  const countBadge = document.getElementById('territoryCountBadge');
  const receivedDateInput = document.getElementById('territoryReceivedDate');
  if (!list) return;
  if (receivedDateInput && !receivedDateInput.value) receivedDateInput.value = territoryTodayIso();

  const sorted = [...state.myTerritories].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (countBadge) {
    countBadge.textContent = `${sorted.length} ${sorted.length === 1 ? 'teritoriu' : 'teritorii'}`;
  }

  if (sorted.length === 0) {
    list.innerHTML = '<div class="empty-state-small">Nu ai adăugat încă niciun teritoriu.</div>';
    return;
  }

  list.innerHTML = sorted.map(t => {
    const status = t.status || 'neinceput';
    const dueInfo = getTerritoryDueInfo(t);
    const receivedDate = dueInfo?.receivedDate || getTerritoryReceivedDate(t);
    const dueText = dueInfo ? formatDate(dueInfo.dueIso) : 'Fără dată';
    const isActive = status !== 'terminat';
    const isOverdue = isActive && dueInfo && dueInfo.daysLeft <= 0;
    const isDueSoon = isActive && dueInfo && dueInfo.daysLeft > 0 && dueInfo.daysLeft <= 14;
    const dueMessage = isOverdue
      ? `⚠️ Au trecut 4 luni. Anunță predarea teritoriului.`
      : isDueSoon
        ? `⚠️ În ${dueInfo.daysLeft} zile se împlinesc 4 luni. Pregătește predarea.`
        : `Termen 4 luni: ${dueText}`;
    const lastVisitText = t.lastVisit ? formatDate(t.lastVisit) : 'Fără dată';
    const mapUrl = getTerritoryMapUrl(t);
    return `
      <article class="territory-card${isOverdue ? ' territory-card-overdue' : ''}${isDueSoon ? ' territory-card-due-soon' : ''}">
        <div class="territory-card-main">
          <div class="territory-card-title-row">
            <input class="territory-title-input" type="text" value="${escHtml(t.name || '')}" placeholder="Nume teritoriu"
              oninput="updateMyTerritory('${t.id}', 'name', this.value)" />
            <span class="territory-status territory-status-${escHtml(status)}">${escHtml(TERRITORY_STATUS_LABELS[status] || 'Neînceput')}</span>
          </div>
          <div class="territory-due-alert${(isOverdue || isDueSoon) ? ' active' : ''}">${escHtml(dueMessage)}</div>
          <input class="territory-area-input" type="text" value="${escHtml(t.area || '')}" placeholder="Zonă / adresă"
            oninput="updateMyTerritory('${t.id}', 'area', this.value)" />
          <textarea class="territory-notes-input" placeholder="Notițe"
            oninput="updateMyTerritory('${t.id}', 'notes', this.value)">${escHtml(t.notes || '')}</textarea>
          <div class="territory-meta-row">
            <label>
              Stare
              <select class="territory-mini-select" onchange="updateMyTerritoryAndRender('${t.id}', 'status', this.value)">
                <option value="neinceput"${status === 'neinceput' ? ' selected' : ''}>Neînceput</option>
                <option value="in-lucru"${status === 'in-lucru' ? ' selected' : ''}>În lucru</option>
                <option value="terminat"${status === 'terminat' ? ' selected' : ''}>Terminat</option>
              </select>
            </label>
            <label>
              Data primirii
              <input class="territory-date-input" type="date" value="${escHtml(receivedDate)}"
                onchange="updateMyTerritoryAndRender('${t.id}', 'receivedDate', this.value)" />
            </label>
            <label>
              Ultima vizită
              <input class="territory-date-input" type="date" value="${escHtml(t.lastVisit || '')}"
                onchange="updateMyTerritoryAndRender('${t.id}', 'lastVisit', this.value)" />
            </label>
            <span class="territory-last-visit">Ultima vizită: ${escHtml(lastVisitText)}</span>
          </div>
        </div>
        <div class="territory-actions">
          <a class="btn-outline btn-sm territory-map-link" href="${escHtml(mapUrl || '#')}" target="_blank" rel="noopener"
            onclick="${mapUrl ? '' : `event.preventDefault(); openTerritoryMap('${t.id}')`}">🧭 Navighează pe hartă</a>
          <button type="button" class="btn-ghost btn-sm" onclick="deleteMyTerritory('${t.id}')">Șterge</button>
        </div>
      </article>
    `;
  }).join('');
}
