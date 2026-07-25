/**
 * IBEX CRM — Utils
 * Funções utilitárias compartilhadas entre todos os módulos
 * @version 1.0.0
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   formATTING
   ───────────────────────────────────────────────────────────────────────── */

/**
 * format a number as BRL currency.
 * @param {number} value
 * @param {boolean} compact - use K/M abbreviations
 */
function formatCurrency(value, compact = false) {
  if (value == null || isNaN(value)) return 'R$ 0';
  if (compact) {
    if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (value >= 1_000)     return `R$ ${(value / 1_000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * format a number with locale separators.
 */
function formatNumber(value) {
  if (value == null || isNaN(value)) return '0';
  return new Intl.NumberFormat('pt-BR').format(value);
}

/**
 * format a date string to pt-BR locale.
 * @param {string|Date} date
 * @param {object} options - Intl.DateTimeFormat options
 */
function formatDate(date, options = {}) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...options,
  });
}

/**
 * format a date as relative time (e.g., "há 2 dias").
 */
function formatRelativeTime(date) {
  if (!date) return '—';
  const d   = date instanceof Date ? date : new Date(date);
  const now = Date.now();
  const diff = now - d.getTime();

  const MINUTE = 60_000;
  const HOUR   = 3_600_000;
  const DAY    = 86_400_000;

  if (diff < MINUTE)       return 'agora mesmo';
  if (diff < HOUR)         return `há ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY)          return `há ${Math.floor(diff / HOUR)}h`;
  if (diff < DAY * 2)      return 'ontem';
  if (diff < DAY * 7)      return `há ${Math.floor(diff / DAY)} dias`;
  if (diff < DAY * 30)     return `há ${Math.floor(diff / (DAY * 7))} sem`;
  if (diff < DAY * 365)    return `há ${Math.floor(diff / (DAY * 30))} meses`;
  return `há ${Math.floor(diff / (DAY * 365))} anos`;
}

/**
 * format a percentage value.
 */
function formatPercent(value) {
  if (value == null || isNaN(value)) return '0%';
  return `${Math.round(value)}%`;
}

/**
 * Get greeting based on current hour.
 */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * Get today's date formatted in pt-BR long format.
 */
function getTodayLong() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   DOM HELPERS
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Query selector shorthand.
 */
function qs(selector, parent = document) {
  return parent.querySelector(selector);
}

/**
 * Query selector all shorthand.
 */
function qsa(selector, parent = document) {
  return [...parent.querySelectorAll(selector)];
}

/**
 * Create an element with optional attributes, classes, and content.
 */
function el(tag, attrs = {}, children = []) {
  const elem = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'class')   elem.className = val;
    else if (key === 'html') elem.innerHTML = val;
    else if (key === 'text') elem.textContent = val;
    else elem.setAttribute(key, val);
  }
  for (const child of children) {
    if (typeof child === 'string') elem.insertAdjacentHTML('beforeend', child);
    else if (child instanceof Node) elem.appendChild(child);
  }
  return elem;
}

/**
 * Show an element by removing the 'hidden' class.
 */
function show(element) {
  if (element) element.hidden = false;
}

/**
 * Hide an element by setting hidden attribute.
 */
function hide(element) {
  if (element) element.hidden = true;
}

/**
 * Toggle class on element.
 */
function toggleClass(element, cls, force) {
  if (element) element.classList.toggle(cls, force);
}

/* ─────────────────────────────────────────────────────────────────────────────
   DEBOUNCE / THROTTLE
   ───────────────────────────────────────────────────────────────────────── */

function debounce(fn, ms = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function throttle(fn, ms = 100) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   HEAT SCORE
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Return heat label and color class for a heat score value.
 */
function getHeatInfo(score) {
  if (score >= 75) return { label: 'Quente',   cls: 'heat-hot',    color: '#f43f5e' };
  if (score >= 50) return { label: 'Morno',    cls: 'heat-warm',   color: '#f59e0b' };
  if (score >= 25) return { label: 'Frio',     cls: 'heat-cold',   color: '#0ea5e9' };
  return              { label: 'Inativo',  cls: 'heat-inactive', color: '#52525b' };
}

/**
 * Return status label for a task.
 */
function getTaskStatusInfo(status) {
  const map = {
    pending: { label: 'Pendente',  cls: 'status-pending',  color: '#f59e0b' },
    overdue: { label: 'Vencido',   cls: 'status-overdue',  color: '#f43f5e' },
    done:    { label: 'Concluído', cls: 'status-done',     color: '#10b981' },
  };
  return map[status] || map.pending;
}

/**
 * Priority badge info.
 */
function getPriorityInfo(priority) {
  const map = {
    urgent: { label: 'Urgente', cls: 'priority-urgent', color: '#f43f5e' },
    high:   { label: 'Alta',    cls: 'priority-high',   color: '#f59e0b' },
    medium: { label: 'Média',   cls: 'priority-medium', color: '#0ea5e9' },
    low:    { label: 'Baixa',   cls: 'priority-low',    color: '#71717a' },
  };
  return map[priority] || map.medium;
}

/* ─────────────────────────────────────────────────────────────────────────────
   STAGE HELPERS
   ───────────────────────────────────────────────────────────────────────── */

function getStageInfo(stageId) {
  const stages = window.PIPELINE_STAGES || [];
  return stages.find(s => s.id === stageId) || { label: stageId, color: '#71717a' };
}

/* ─────────────────────────────────────────────────────────────────────────────
   AVATAR / INITIALS
   ───────────────────────────────────────────────────────────────────────── */

function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

/* ─────────────────────────────────────────────────────────────────────────────
   DELTA INDICATOR
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Return HTML string for a delta badge (▲ +12% or ▼ -3%)
 */
function deltaBadge(value, suffix = '%') {
  if (value === 0 || value == null) return `<span class="delta delta-neutral">— 0${suffix}</span>`;
  const up  = value > 0;
  const cls = up ? 'delta-up' : 'delta-down';
  const arrow = up ? '▲' : '▼';
  return `<span class="delta ${cls}">${arrow} ${Math.abs(value)}${suffix}</span>`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   EXPORTS — attach to window
   ───────────────────────────────────────────────────────────────────────── */

window.IbexUtils = {
  formatCurrency,
  formatNumber,
  formatDate,
  formatRelativeTime,
  formatPercent,
  getGreeting,
  getTodayLong,
  qs,
  qsa,
  el,
  show,
  hide,
  toggleClass,
  debounce,
  throttle,
  getHeatInfo,
  getTaskStatusInfo,
  getPriorityInfo,
  getStageInfo,
  getInitials,
  deltaBadge,
};

/* Also export as flat globals for convenience */
window.formatCurrency    = formatCurrency;
window.formatNumber      = formatNumber;
window.formatDate        = formatDate;
window.formatRelativeTime = formatRelativeTime;
window.formatPercent     = formatPercent;
window.getGreeting       = getGreeting;
window.getTodayLong      = getTodayLong;
window.getHeatInfo       = getHeatInfo;
window.getStageInfo      = getStageInfo;
window.getInitials       = getInitials;
window.deltaBadge        = deltaBadge;
