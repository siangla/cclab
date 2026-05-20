/* ============================================================
   今天吃什麼 — app.js
   Storage: Firebase Realtime DB (shared) or localStorage (local)
   ============================================================ */

'use strict';

// ─── Default Settings ────────────────────────────────────────
const DEFAULT_SETTINGS = {
  foods: {
    'weekday-exercise': ['雞胸肉便當', '沙拉', '蒸地瓜', '水煮蛋飯'],
    'weekday-normal':   ['排骨便當', '炒飯', '麵', '水餃', '牛肉麵'],
    'weekend-exercise': ['雞胸肉沙拉', '蛋白質餐盒', '滷蛋飯'],
    'weekend-normal':   ['火鍋', '燒烤', '義大利麵', '日式料理', '漢堡'],
  },
  dayOverride: {
    // e.g. '1': { exercise: [...], normal: [...] }
    // 0=日,1=一,...,6=六
  }
};

// ─── State ───────────────────────────────────────────────────
let state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  records: {},      // { 'YYYY-MM-DD': { lunch, dinner, cost, note, status, exercise } }
  firebase: { url: '', key: '' },
  addFoodTarget: null,
  modalDate: null,
  modalStatus: 'actual',
};

// ─── Persistence helpers ──────────────────────────────────────
function storageKey(k) {
  const seg = state.firebase.key ? `_${state.firebase.key}` : '';
  return `mealplan${seg}_${k}`;
}

function isFirebaseReady() {
  return !!(state.firebase.url && state.firebase.url.startsWith('http'));
}

async function saveData(type, value) {
  if (isFirebaseReady()) {
    const key = state.firebase.key || 'default';
    const url = `${state.firebase.url.replace(/\/$/, '')}/${key}/${type}.json`;
    try {
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
    } catch (e) { console.warn('Firebase write failed', e); }
  } else {
    localStorage.setItem(storageKey(type), JSON.stringify(value));
  }
}

async function loadData(type) {
  if (isFirebaseReady()) {
    const key = state.firebase.key || 'default';
    const url = `${state.firebase.url.replace(/\/$/, '')}/${key}/${type}.json`;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('fetch failed');
      const d = await r.json();
      return d;
    } catch (e) { console.warn('Firebase read failed', e); return null; }
  } else {
    const raw = localStorage.getItem(storageKey(type));
    return raw ? JSON.parse(raw) : null;
  }
}

// ─── Init ─────────────────────────────────────────────────────
async function init() {
  // Load firebase config
  const fbRaw = localStorage.getItem('mealplan_firebase');
  if (fbRaw) {
    state.firebase = JSON.parse(fbRaw);
    updateFirebaseStatus();
  } else {
    updateFirebaseStatus(true); // local
  }
  document.getElementById('firebase-url').value = state.firebase.url || '';
  document.getElementById('firebase-key').value = state.firebase.key || '';

  // Load settings & records
  const [sett, recs] = await Promise.all([loadData('settings'), loadData('records')]);
  if (sett) state.settings = sett;
  if (recs) state.records = recs;

  renderCalendar();
  renderSettings();
  setupDayOverrides();
  bindEvents();
}

// ─── Calendar ─────────────────────────────────────────────────
const DAY_NAMES = ['日','一','二','三','四','五','六'];
const MONTH_NAMES = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];

function renderCalendar() {
  const label = document.getElementById('month-label');
  label.textContent = `${state.year}年 ${MONTH_NAMES[state.month]}月`;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  // Headers
  DAY_NAMES.forEach((d, i) => {
    const h = document.createElement('div');
    h.className = 'cal-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  const firstDay = new Date(state.year, state.month, 1).getDay();
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  const today = new Date();

  // Empty cells
  for (let i = 0; i < firstDay; i++) {
    const e = document.createElement('div');
    e.className = 'cal-day empty';
    grid.appendChild(e);
  }

  // Days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDate(state.year, state.month, d);
    const rec = state.records[dateStr];
    const dow = new Date(state.year, state.month, d).getDay();

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (dow === 0) cell.classList.add('is-sunday');
    if (dow === 6) cell.classList.add('is-saturday');
    const isToday = today.getFullYear() === state.year && today.getMonth() === state.month && today.getDate() === d;
    if (isToday) cell.classList.add('today');

    // Day number
    const numEl = document.createElement('div');
    numEl.className = 'day-num';
    numEl.textContent = d;
    cell.appendChild(numEl);

    if (rec) {
      // Exercise badge
      if (rec.exercise) {
        const badge = document.createElement('div');
        badge.className = 'day-exercise-badge';
        badge.textContent = '🏃運動';
        cell.appendChild(badge);
      }
      // Meals
      const mealsEl = document.createElement('div');
      mealsEl.className = 'day-meals';
      const statusClass = rec.status || 'actual';
      if (rec.lunch) {
        const t = document.createElement('div');
        t.className = `day-meal-tag ${statusClass}`;
        t.textContent = `🍽 ${rec.lunch}`;
        mealsEl.appendChild(t);
      }
      if (rec.dinner) {
        const t = document.createElement('div');
        t.className = `day-meal-tag ${statusClass}`;
        t.textContent = `🌙 ${rec.dinner}`;
        mealsEl.appendChild(t);
      }
      cell.appendChild(mealsEl);
      // Cost
      if (rec.cost) {
        const costEl = document.createElement('div');
        costEl.className = 'day-cost';
        costEl.textContent = `NT$${rec.cost}`;
        cell.appendChild(costEl);
      }
    }

    cell.addEventListener('click', () => openModal(dateStr, d));
    grid.appendChild(cell);
  }
}

function formatDate(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// ─── Modal ────────────────────────────────────────────────────
function openModal(dateStr, dayNum) {
  state.modalDate = dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m-1, d).getDay();

  document.getElementById('modal-date-title').textContent =
    `${m}月${d}日（${DAY_NAMES[dow]}）`;

  const rec = state.records[dateStr] || {};
  document.getElementById('modal-exercise').checked = !!rec.exercise;
  document.getElementById('modal-lunch').value = rec.lunch || '';
  document.getElementById('modal-dinner').value = rec.dinner || '';
  document.getElementById('modal-cost').value = rec.cost || '';
  document.getElementById('modal-note').value = rec.note || '';

  state.modalStatus = rec.status || 'actual';
  updateStatusBtns();

  renderSuggestions(dow, !!rec.exercise);
  document.getElementById('modal-exercise').addEventListener('change', () => {
    renderSuggestions(dow, document.getElementById('modal-exercise').checked);
  });

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  state.modalDate = null;
}

function updateStatusBtns() {
  document.querySelectorAll('.status-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === state.modalStatus);
  });
}

function renderSuggestions(dow, isExercise) {
  const foods = getFoodsForDay(dow, isExercise);
  const list = document.getElementById('suggest-list');
  list.innerHTML = '';
  foods.forEach(f => {
    const chip = document.createElement('button');
    chip.className = 'suggest-chip';
    chip.textContent = f;
    chip.addEventListener('click', () => {
      const lunch = document.getElementById('modal-lunch');
      const dinner = document.getElementById('modal-dinner');
      if (!lunch.value) lunch.value = f;
      else if (!dinner.value) dinner.value = f;
      else lunch.value = f;
    });
    list.appendChild(chip);
  });
}

function getFoodsForDay(dow, isExercise) {
  // Check day override first
  const override = state.settings.dayOverride[dow];
  if (override) {
    return isExercise ? (override.exercise || []) : (override.normal || []);
  }
  const isWeekend = dow === 0 || dow === 6;
  const key = `${isWeekend ? 'weekend' : 'weekday'}-${isExercise ? 'exercise' : 'normal'}`;
  return state.settings.foods[key] || [];
}

async function saveModal() {
  const dateStr = state.modalDate;
  if (!dateStr) return;
  const rec = {
    exercise: document.getElementById('modal-exercise').checked,
    lunch:    document.getElementById('modal-lunch').value.trim(),
    dinner:   document.getElementById('modal-dinner').value.trim(),
    cost:     document.getElementById('modal-cost').value || '',
    note:     document.getElementById('modal-note').value.trim(),
    status:   state.modalStatus,
  };
  state.records[dateStr] = rec;
  await saveData('records', state.records);
  renderCalendar();
  closeModal();
  showToast('✅ 儲存成功！');
}

async function deleteModal() {
  const dateStr = state.modalDate;
  if (!dateStr) return;
  delete state.records[dateStr];
  await saveData('records', state.records);
  renderCalendar();
  closeModal();
  showToast('🗑️ 已清除');
}

// ─── Random Pick ──────────────────────────────────────────────
function randomPick() {
  const today = new Date();
  const dow = today.getDay();
  const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate());
  const rec = state.records[todayStr];
  const isExercise = rec ? rec.exercise : false;
  const foods = getFoodsForDay(dow, isExercise);

  if (!foods.length) {
    showToast('⚠️ 請先在設定中新增餐點！');
    return;
  }

  const pick = foods[Math.floor(Math.random() * foods.length)];
  document.getElementById('random-food-name').textContent = pick;
  document.getElementById('random-result').classList.remove('hidden');
}

// ─── Settings ────────────────────────────────────────────────
function renderSettings() {
  const keys = ['weekday-exercise','weekday-normal','weekend-exercise','weekend-normal'];
  keys.forEach(k => {
    const el = document.getElementById(`food-${k}`);
    if (!el) return;
    el.innerHTML = '';
    (state.settings.foods[k] || []).forEach(f => addChip(el, k, f));
  });

  // Day overrides
  const overrideContainer = document.getElementById('day-overrides');
  if (!overrideContainer) return;
  overrideContainer.querySelectorAll('[data-override-meal]').forEach(el => {
    el.innerHTML = '';
    const dow = el.dataset.overrideDow;
    const type = el.dataset.overrideMeal;
    const arr = (state.settings.dayOverride[dow] || {})[type] || [];
    arr.forEach(f => addChip(el, `override-${dow}-${type}`, f));
  });
}

function addChip(container, key, text) {
  const chip = document.createElement('div');
  chip.className = 'meal-chip';
  chip.innerHTML = `<span>${text}</span><button class="remove-chip" aria-label="移除">×</button>`;
  chip.querySelector('.remove-chip').addEventListener('click', () => {
    chip.remove();
  });
  container.appendChild(chip);
}

function setupDayOverrides() {
  const container = document.getElementById('day-overrides');
  if (!container) return;
  const labels = ['日','一','二','三','四','五','六'];
  labels.forEach((label, dow) => {
    const card = document.createElement('div');
    card.className = 'day-override-card';
    card.innerHTML = `
      <h4>星期${label}</h4>
      <p class="override-hint">留空則套用上方預設</p>
      <div class="toggle-label" style="font-size:0.8rem;margin-bottom:4px">🏃 運動</div>
      <div class="meal-list" data-override-dow="${dow}" data-override-meal="exercise"></div>
      <button class="add-food-btn" data-target="override-${dow}-exercise" style="margin-bottom:8px">+ 新增</button>
      <div class="toggle-label" style="font-size:0.8rem;margin-bottom:4px">🛋️ 一般</div>
      <div class="meal-list" data-override-dow="${dow}" data-override-meal="normal"></div>
      <button class="add-food-btn" data-target="override-${dow}-normal">+ 新增</button>
    `;
    container.appendChild(card);
  });
}

async function saveSettings() {
  // Read main food lists
  const keys = ['weekday-exercise','weekday-normal','weekend-exercise','weekend-normal'];
  keys.forEach(k => {
    const el = document.getElementById(`food-${k}`);
    if (!el) return;
    state.settings.foods[k] = Array.from(el.querySelectorAll('.meal-chip span')).map(s => s.textContent);
  });

  // Read day overrides
  state.settings.dayOverride = {};
  document.querySelectorAll('[data-override-dow]').forEach(el => {
    const dow = el.dataset.overrideDow;
    const type = el.dataset.overrideMeal;
    const arr = Array.from(el.querySelectorAll('.meal-chip span')).map(s => s.textContent);
    if (arr.length) {
      if (!state.settings.dayOverride[dow]) state.settings.dayOverride[dow] = {};
      state.settings.dayOverride[dow][type] = arr;
    }
  });

  await saveData('settings', state.settings);
  showToast('⚙️ 設定已儲存！');
}

// ─── Firebase ─────────────────────────────────────────────────
async function saveFirebase() {
  const url = document.getElementById('firebase-url').value.trim();
  const key = document.getElementById('firebase-key').value.trim();

  if (!url) {
    showToast('⚠️ 請輸入 Firebase URL');
    return;
  }

  // Test connection
  try {
    const testUrl = `${url.replace(/\/$/, '')}/ping.json`;
    const r = await fetch(testUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '"ok"',
    });
    if (!r.ok) throw new Error('write failed');
  } catch (e) {
    setFirebaseStatus('err', '❌ 無法連線，請檢查 Firebase URL 與規則設定。');
    return;
  }

  state.firebase = { url, key };
  localStorage.setItem('mealplan_firebase', JSON.stringify(state.firebase));
  setFirebaseStatus('ok', '✅ 已連線至 Firebase！正在載入共用資料…');

  // Reload data from Firebase
  const [sett, recs] = await Promise.all([loadData('settings'), loadData('records')]);
  if (sett) state.settings = sett;
  if (recs) state.records = recs;
  renderCalendar();
  renderSettings();
  showToast('🔗 已連線並同步！');
}

function clearFirebase() {
  state.firebase = { url: '', key: '' };
  localStorage.removeItem('mealplan_firebase');
  document.getElementById('firebase-url').value = '';
  document.getElementById('firebase-key').value = '';
  setFirebaseStatus('local', '📦 目前使用本機儲存（瀏覽器 localStorage）');
  showToast('已切換為本機儲存');
}

function setFirebaseStatus(type, msg) {
  const el = document.getElementById('firebase-status');
  el.className = `firebase-status ${type}`;
  el.textContent = msg;
}

function updateFirebaseStatus(forceLocal = false) {
  if (forceLocal || !state.firebase.url) {
    setFirebaseStatus('local', '📦 目前使用本機儲存（瀏覽器 localStorage）');
  } else {
    setFirebaseStatus('ok', `✅ 已連線至 Firebase：${state.firebase.url}`);
  }
}

// ─── Add Food Modal ───────────────────────────────────────────
function openAddFood(target) {
  state.addFoodTarget = target;
  document.getElementById('addfood-input').value = '';
  document.getElementById('addfood-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('addfood-input').focus(), 50);
}

function closeAddFood() {
  document.getElementById('addfood-overlay').classList.add('hidden');
  state.addFoodTarget = null;
}

function confirmAddFood() {
  const val = document.getElementById('addfood-input').value.trim();
  if (!val) return;
  const target = state.addFoodTarget;

  if (target.startsWith('override-')) {
    // override-{dow}-{type}
    const parts = target.split('-');
    const dow = parts[1];
    const type = parts[2];
    const container = document.querySelector(`[data-override-dow="${dow}"][data-override-meal="${type}"]`);
    if (container) addChip(container, target, val);
  } else {
    const el = document.getElementById(`food-${target}`);
    if (el) addChip(el, target, val);
  }

  closeAddFood();
}

// ─── Dice (random for specific meal field) ───────────────────
function diceForMeal(mealType) {
  const dateStr = state.modalDate;
  if (!dateStr) return;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m-1, d).getDay();
  const isExercise = document.getElementById('modal-exercise').checked;
  const foods = getFoodsForDay(dow, isExercise);
  if (!foods.length) { showToast('⚠️ 沒有可選餐點！'); return; }
  const pick = foods[Math.floor(Math.random() * foods.length)];
  document.getElementById(`modal-${mealType}`).value = pick;
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ─── Events ──────────────────────────────────────────────────
function bindEvents() {
  // Nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
    });
  });

  // Calendar nav
  document.getElementById('prev-month').addEventListener('click', () => {
    state.month--;
    if (state.month < 0) { state.month = 11; state.year--; }
    renderCalendar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    state.month++;
    if (state.month > 11) { state.month = 0; state.year++; }
    renderCalendar();
  });

  // Random
  document.getElementById('random-btn').addEventListener('click', randomPick);
  document.getElementById('random-close').addEventListener('click', () => {
    document.getElementById('random-result').classList.add('hidden');
  });

  // Modal
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveModal);
  document.getElementById('modal-delete').addEventListener('click', deleteModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Status buttons
  document.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.modalStatus = btn.dataset.status;
      updateStatusBtns();
    });
  });

  // Dice buttons in modal
  document.querySelectorAll('.dice-btn').forEach(btn => {
    btn.addEventListener('click', () => diceForMeal(btn.dataset.meal));
  });

  // Settings tabs
  document.querySelectorAll('.stab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`settings-panel-${btn.dataset.day}`).classList.add('active');
    });
  });

  // Add food buttons — delegated on document
  document.addEventListener('click', e => {
    if (e.target.classList.contains('add-food-btn')) {
      openAddFood(e.target.dataset.target);
    }
  });

  // Add food modal
  document.getElementById('addfood-close').addEventListener('click', closeAddFood);
  document.getElementById('addfood-confirm').addEventListener('click', confirmAddFood);
  document.getElementById('addfood-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAddFood();
  });
  document.getElementById('addfood-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmAddFood();
  });

  // Save settings
  document.getElementById('save-settings').addEventListener('click', saveSettings);

  // Firebase
  document.getElementById('save-firebase').addEventListener('click', saveFirebase);
  document.getElementById('clear-firebase').addEventListener('click', clearFirebase);
}

// ─── Start ────────────────────────────────────────────────────
init();
