'use strict';

// ============================================
// TELEPROMPTER (reutilizat de Cuvântare 5 minute și Cuvântare Publică 30 minute)
// Derulare automată a textului scris, portată din aplicația "Orator".
// ============================================

let teleprompterActive = false;
let teleprompterPlaying = false;
let teleprompterRAF = null;
let teleprompterSpeed = 8;
let teleprompterFontSize = 40;

function loadTeleprompterPrefs() {
  try {
    const savedSpeed = localStorage.getItem('teleprompter_speed');
    const savedFont = localStorage.getItem('teleprompter_fontsize');
    if (savedSpeed) teleprompterSpeed = Math.max(1, Math.min(30, Number(savedSpeed) || 8));
    if (savedFont) teleprompterFontSize = Math.max(20, Math.min(90, Number(savedFont) || 40));
  } catch (e) { /* localStorage indisponibil - folosim valorile implicite */ }
}

function saveTeleprompterPrefs() {
  try {
    localStorage.setItem('teleprompter_speed', String(teleprompterSpeed));
    localStorage.setItem('teleprompter_fontsize', String(teleprompterFontSize));
  } catch (e) { /* ignorat */ }
}

function openTeleprompter(textareaId, title) {
  const textarea = document.getElementById(textareaId);
  const overlay = document.getElementById('teleprompterOverlay');
  const textEl = document.getElementById('teleprompterText');
  const container = document.getElementById('teleprompterContainer');
  if (!textarea || !overlay || !textEl || !container) return;

  const text = (textarea.value || '').trim();
  if (!text) {
    if (typeof showToast === 'function') showToast('Scrie mai întâi textul cuvântării.', 'error');
    return;
  }

  loadTeleprompterPrefs();
  teleprompterActive = true;
  teleprompterPlaying = false;

  textEl.textContent = text;
  textEl.style.fontSize = teleprompterFontSize + 'px';

  const titleEl = document.getElementById('teleprompterTitle');
  if (titleEl) titleEl.textContent = title || 'Cuvântare';

  const speedInput = document.getElementById('teleprompterSpeed');
  const speedValue = document.getElementById('teleprompterSpeedValue');
  if (speedInput) speedInput.value = teleprompterSpeed;
  if (speedValue) speedValue.textContent = teleprompterSpeed;

  const fontInput = document.getElementById('teleprompterFontSize');
  const fontValue = document.getElementById('teleprompterFontSizeValue');
  if (fontInput) fontInput.value = teleprompterFontSize;
  if (fontValue) fontValue.textContent = teleprompterFontSize;

  overlay.classList.add('active');
  container.scrollTop = 0;
  updateTeleprompterPlayButtons();

  if (typeof document.body.requestFullscreen === 'function' && !document.fullscreenElement) {
    overlay.requestFullscreen?.().catch(() => {});
  }
}

function closeTeleprompter() {
  teleprompterPauseScroll();
  const overlay = document.getElementById('teleprompterOverlay');
  if (overlay) overlay.classList.remove('active');
  teleprompterActive = false;
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
}

function teleprompterPlay() {
  if (!teleprompterActive) return;
  teleprompterPlaying = true;
  updateTeleprompterPlayButtons();
  teleprompterScrollStep();
}

function teleprompterPause() {
  teleprompterPauseScroll();
  updateTeleprompterPlayButtons();
}

function teleprompterPauseScroll() {
  teleprompterPlaying = false;
  if (teleprompterRAF) cancelAnimationFrame(teleprompterRAF);
  teleprompterRAF = null;
}

function teleprompterScrollStep() {
  if (!teleprompterPlaying) return;
  const container = document.getElementById('teleprompterContainer');
  if (!container) return;

  container.scrollTop += teleprompterSpeed / 5;

  if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
    teleprompterPauseScroll();
    updateTeleprompterPlayButtons();
    return;
  }

  teleprompterRAF = requestAnimationFrame(teleprompterScrollStep);
}

function updateTeleprompterPlayButtons() {
  const playBtn = document.getElementById('teleprompterPlayBtn');
  const pauseBtn = document.getElementById('teleprompterPauseBtn');
  if (playBtn) playBtn.disabled = teleprompterPlaying;
  if (pauseBtn) pauseBtn.disabled = !teleprompterPlaying;
}

function changeTeleprompterSpeed(value) {
  teleprompterSpeed = Math.max(1, Math.min(30, Number(value) || 8));
  const label = document.getElementById('teleprompterSpeedValue');
  if (label) label.textContent = teleprompterSpeed;
  saveTeleprompterPrefs();
}

function changeTeleprompterFontSize(value) {
  teleprompterFontSize = Math.max(20, Math.min(90, Number(value) || 40));
  const label = document.getElementById('teleprompterFontSizeValue');
  if (label) label.textContent = teleprompterFontSize;
  const textEl = document.getElementById('teleprompterText');
  if (textEl) textEl.style.fontSize = teleprompterFontSize + 'px';
  saveTeleprompterPrefs();
}

document.addEventListener('keydown', (e) => {
  if (!teleprompterActive) return;
  if (e.key === 'Escape') { closeTeleprompter(); return; }
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (teleprompterPlaying) teleprompterPause(); else teleprompterPlay();
  }
});
