/* ============================================================
   今天吃什麼 — eatwhat.js v4
   架構：離線優先 (Offline-first)
   ─────────────────────────────────────────────────────────
   所有日常操作（新增、編輯、設定）都只寫入 localStorage。
   Firebase 只在兩個明確的手動動作時才被呼叫：
     1. 「從 Firebase 拉取」：拉回資料存入本機，之後完全離線
     2. 「推送至 Firebase」：將本機資料整包推上去
   這樣兩個人可以各自在本機編輯，需要同步時再手動推送/拉取。
   ============================================================ */
'use strict';

// ─── Empty & Default Settings ─────────────────────────────────
function emptySettings() {
  return {
    foods: { 'exercise': [], 'normal': [] },
    dayOverride: {}
  };
}

const DEFAULT_SETTINGS = {
  foods: {
    'exercise': ['雞胸肉便當', '沙拉', '蒸地瓜', '水煮蛋飯'],
    'normal':   ['排骨便當', '炒飯', '麵', '水餃', '牛肉麵'],
  },
  dayOverride: {}
  // dayOverride[dow] = { exercise: [...額外餐點], normal: [...額外餐點] }
  // 額外餐點與基本清單合併，不覆蓋
};

// 相容舊格式（weekday/weekend × exercise/normal 4個key）→ 合併為新格式（2個key）
function migrateLegacySettings(old) {
  const exerciseFoods = new Set([
    ...(old.foods['weekday-exercise'] || []),
    ...(old.foods['weekend-exercise'] || []),
  ]);
  const normalFoods = new Set([
    ...(old.foods['weekday-normal'] || []),
    ...(old.foods['weekend-normal'] || []),
  ]);
  return {
    foods: {
      exercise: [...exerciseFoods],
      normal:   [...normalFoods],
    },
    dayOverride: old.dayOverride || {},
  };
}



// ─── State ────────────────────────────────────────────────────
let state = {
  year:  new Date().getFullYear(),
  month: new Date().getMonth(),
  settings:     JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  records:      {},
  // Firebase config 只儲存 URL 和 key，不代表「目前連線中」
  firebaseCfg:  { url: '', key: '' },
  addFoodTarget: null,
  modalDate:     null,
  modalStatus:   'actual',
  importBuffer:  null,
  // groups: { '群組名': ['餐點1','餐點2',...] }
  groups: {},
};

// ─── LocalStorage helpers（所有日常讀寫都只碰本機）────────────
// 固定 key，不與 Firebase key 綁定，避免重新整理後找不到資料
const LS_PREFIX = 'eatwhat_local';
function lsSave(type, value) {
  try {
    localStorage.setItem(`${LS_PREFIX}_${type}`, JSON.stringify(value));
  } catch (e) { console.warn('lsSave failed', e); }
}
function lsLoad(type) {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}_${type}`);
    if (!raw || raw === 'null' || raw === 'undefined') {
      console.log(`[lsLoad] ${type}: 無資料`);
      return null;
    }
    const parsed = JSON.parse(raw);
    console.log(`[lsLoad] ${type}: 讀到`, typeof parsed, Array.isArray(parsed) ? '(array)' : '');
    return parsed;
  } catch (e) {
    console.warn(`[lsLoad] ${type} 解析失敗:`, e);
    return null;
  }
}

// ─── Firebase helpers（只在手動操作時呼叫）───────────────────
function fbBaseUrl() {
  const { url, key } = state.firebaseCfg;
  if (!url) return null;
  const seg = key || 'default';
  return `${url.replace(/\/$/, '')}/${seg}`;
}

async function fbFetch(path, method = 'GET', body = null) {
  const base = fbBaseUrl();
  if (!base) throw new Error('Firebase URL 未設定');
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',   // 禁用瀏覽器快取，確保每次都拿最新資料
  };
  if (body !== null) opts.body = JSON.stringify(body);
  // 加上時間戳參數，額外防止 CDN/proxy 快取
  const bust = method === 'GET' ? `?_=${Date.now()}` : '';
  const res = await fetch(`${base}/${path}.json${bust}`, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Firebase 單筆推送 helpers ───────────────────────────────
// 有 Firebase config 才推，沒有就只存本機，不阻擋 UI
function hasFbCfg() {
  return !!(state.firebaseCfg.url && state.firebaseCfg.url.startsWith('http'));
}

// 推送單筆記錄（儲存/刪除某天時呼叫）
async function fbPushRecord(dateStr, recData) {
  if (!hasFbCfg()) return;
  try {
    const base = fbBaseUrl();
    const seg  = state.firebaseCfg.key || 'default';
    const url  = `${state.firebaseCfg.url.replace(/\/$/, '')}/${seg}/records/${dateStr}.json`;
    const method = recData ? 'PUT' : 'DELETE';
    const opts = { method, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' };
    if (recData) opts.body = JSON.stringify(recData);
    await fetch(url, opts);
    updateSyncStatus('record', dateStr);
  } catch (e) {
    console.warn('[fbPushRecord] 推送失敗', e);
    // 靜默失敗，不打擾使用者，本機已儲存
  }
}

// 推送整包 settings（設定修改後呼叫）
async function fbPushSettings() {
  if (!hasFbCfg()) return;
  try {
    await fbFetch('settings', 'PUT', state.settings);
    updateSyncStatus('settings');
  } catch (e) {
    console.warn('[fbPushSettings] 設定推送失敗', e);
  }
}

// 更新共用頁同步狀態文字
function updateSyncStatus(type, dateStr) {
  const time = new Date().toLocaleTimeString();
  const msg  = type === 'record'
    ? `✅ 已同步：${dateStr} 的記錄（${time}）`
    : `✅ 設定已同步至 Firebase（${time}）`;
  // 只有在共用頁面時才更新狀態，不影響其他頁面
  const el = document.getElementById('firebase-status');
  if (el && el.className.includes('ok') || el && el.className.includes('info')) {
    setShareStatus('ok', msg);
  }
}

// ─── Init ─────────────────────────────────────────────────────
function applySettings(rawSett) {
  if (!rawSett || typeof rawSett !== 'object' || !rawSett.foods) return false;
  if ('weekday-exercise' in rawSett.foods || 'weekend-exercise' in rawSett.foods) {
    rawSett = migrateLegacySettings(rawSett);
  }
  if (!Array.isArray(rawSett.foods['exercise'])) rawSett.foods['exercise'] = [];
  if (!Array.isArray(rawSett.foods['normal']))   rawSett.foods['normal']   = [];
  if (!rawSett.dayOverride || typeof rawSett.dayOverride !== 'object') rawSett.dayOverride = {};
  state.settings = rawSett;
  return true;
}

function applyRecords(recs) {
  if (!recs || typeof recs !== 'object' || Array.isArray(recs)) return false;
  state.records = recs;
  return true;
}

function init() {
  // 讀取 Firebase config
  try {
    const fbRaw = localStorage.getItem('mealplan_firebase_cfg');
    if (fbRaw) state.firebaseCfg = JSON.parse(fbRaw);
  } catch (e) { /* 損壞的 config 就忽略 */ }

  // 先從本機載入（同步，確保 UI 立即可用）
  applySettings(lsLoad('settings'));
  applyRecords(lsLoad('records'));
  const savedGroups = lsLoad('groups');
  if (savedGroups && typeof savedGroups === 'object' && !Array.isArray(savedGroups)) {
    state.groups = savedGroups;
  }

  updateSharePageUI();
  setupDayOverrides();

  try { renderCalendar(); } catch (e) { console.error('renderCalendar error', e); }
  try { renderSettings(); } catch (e) { console.error('renderSettings error', e); }
  try { renderGroups(); }   catch (e) { console.error('renderGroups error', e); }

  renderGroupSelect();
  bindEvents(); // 一定要執行到

  // 若有 Firebase config，背景自動拉取一次最新資料
  if (hasFbCfg()) {
    setShareStatus('loading', '⏳ 正在從 Firebase 拉取最新資料…');
    fbAutoSync();
  }
}

// 啟動時背景自動拉取（不阻擋 UI）
async function fbAutoSync() {
  try {
    const [rawSett, rawRecs] = await Promise.all([
      fbFetch('settings'),
      fbFetch('records'),
    ]);
    const validSett = rawSett && typeof rawSett === 'object' && rawSett.foods ? rawSett : null;
    const validRecs = rawRecs && typeof rawRecs === 'object' && !Array.isArray(rawRecs) ? rawRecs : null;

    let changed = false;
    if (validSett && applySettings(validSett)) { lsSave('settings', state.settings); changed = true; }
    if (validRecs && applyRecords(validRecs))  { lsSave('records',  state.records);  changed = true; }
    const rawGroups = await fbFetch('groups').catch(() => null);
    if (rawGroups && typeof rawGroups === 'object' && !Array.isArray(rawGroups)) {
      state.groups = rawGroups; lsSave('groups', rawGroups); changed = true;
    }

    if (changed) {
      renderCalendar();
      renderSettings();
      renderGroups();
    }
    const time = new Date().toLocaleTimeString();
    setShareStatus('ok', `✅ 已連線 Firebase，自動同步完成（${time}）`);
  } catch (e) {
    console.warn('[fbAutoSync] 自動拉取失敗', e);
    setShareStatus('info', `📋 已記憶 Firebase 設定，但自動拉取失敗（離線模式）`);
  }
}

// ─── Calendar ─────────────────────────────────────────────────
const DAY_NAMES   = ['日','一','二','三','四','五','六'];
const MONTH_NAMES = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];

function renderCalendar() {
  // Guard: ensure records and settings are valid objects
  if (!state.records || typeof state.records !== 'object') state.records = {};
  if (!state.settings || typeof state.settings !== 'object') state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  document.getElementById('month-label').textContent =
    `${state.year}年 ${MONTH_NAMES[state.month]}月`;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';
  DAY_NAMES.forEach(d => {
    const h = document.createElement('div'); h.className = 'cal-header'; h.textContent = d; grid.appendChild(h);
  });

  const firstDay    = new Date(state.year, state.month, 1).getDay();
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  const today       = new Date();

  for (let i = 0; i < firstDay; i++) {
    const e = document.createElement('div'); e.className = 'cal-day empty'; grid.appendChild(e);
  }

  let totalRecords = 0, totalExercise = 0, totalCost = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDate(state.year, state.month, d);
    const rec = state.records[dateStr];
    const dow = new Date(state.year, state.month, d).getDay();
    const isToday = today.getFullYear() === state.year &&
                    today.getMonth()    === state.month &&
                    today.getDate()     === d;

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (dow === 0) cell.classList.add('is-sunday');
    if (dow === 6) cell.classList.add('is-saturday');
    if (isToday)   cell.classList.add('today');

    const numEl = document.createElement('div');
    numEl.className = 'day-num'; numEl.textContent = d; cell.appendChild(numEl);

    if (rec) {
      if (rec.lunch || rec.dinner) totalRecords++;
      if (rec.exercise) totalExercise++;
      if (rec.cost) totalCost += Number(rec.cost) || 0;

      // 運動日：class 加上 has-exercise，CSS 顯示小圓點，不顯示文字和底色
      if (rec.exercise) cell.classList.add('has-exercise');

      // 餐點顯示：純文字，無圖示；狀態用 CSS 邊框區分（planned=虛線, actual=實線）
      const mealsEl = document.createElement('div'); mealsEl.className = 'day-meals';
      const sc = rec.status || 'planned';
      if (rec.lunch && rec.dinner) {
        // 兩餐都有 → 各一行
        const tL = document.createElement('div');
        tL.className = `day-meal-tag ${sc}`; tL.textContent = rec.lunch; mealsEl.appendChild(tL);
        const tD = document.createElement('div');
        tD.className = `day-meal-tag ${sc}`; tD.textContent = rec.dinner; mealsEl.appendChild(tD);
      } else if (rec.lunch || rec.dinner) {
        // 只有一餐 → 顯示那個
        const t = document.createElement('div');
        t.className = `day-meal-tag ${sc}`; t.textContent = rec.lunch || rec.dinner; mealsEl.appendChild(t);
      }
      cell.appendChild(mealsEl);
      if (rec.cost) {
        const costEl = document.createElement('div');
        costEl.className = 'day-cost'; costEl.textContent = `NT$${rec.cost}`; cell.appendChild(costEl);
      }
    }

    cell.addEventListener('click', () => openModal(dateStr));
    grid.appendChild(cell);
  }

  document.getElementById('stat-records').textContent  = totalRecords;
  document.getElementById('stat-exercise').textContent = totalExercise;
  document.getElementById('stat-cost').textContent     = `NT$${totalCost.toLocaleString()}`;
}

function formatDate(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// ─── Day Modal ────────────────────────────────────────────────
function openModal(dateStr) {
  state.modalDate = dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m-1, d).getDay();
  document.getElementById('modal-date-title').textContent = `${m}月${d}日（${DAY_NAMES[dow]}）`;

  const rec = state.records[dateStr] || {};
  const isExercise = !!rec.exercise;

  // Replace exercise checkbox node to strip stale listeners
  const oldEx = document.getElementById('modal-exercise');
  const newEx = oldEx.cloneNode(true);
  newEx.checked = isExercise;
  oldEx.parentNode.replaceChild(newEx, oldEx);
  newEx.addEventListener('change', () => renderSuggestions(dow, newEx.checked));

  document.getElementById('modal-cost').value  = rec.cost  || '';
  document.getElementById('modal-note').value  = rec.note  || '';
  state.modalStatus = rec.status || 'planned';
  updateStatusBtns();
  // 先填充 select options，再設已儲存的值
  // 順序不能對調：select 沒有 option 時設 value 無效
  renderSuggestions(dow, isExercise);
  document.getElementById('modal-lunch').value  = rec.lunch  || '';
  document.getElementById('modal-dinner').value = rec.dinner || '';
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
  // 填充 datalist（input + datalist 同時支援下拉選擇和自由輸入）
  [['modal-lunch','lunch-list'], ['modal-dinner','dinner-list']].forEach(([inputId, listId]) => {
    const dl = document.getElementById(listId);
    if (!dl) return;
    dl.innerHTML = '';
    foods.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      dl.appendChild(opt);
    });
  });
}

function getFoodsForDay(dow, isExercise) {
  const type   = isExercise ? 'exercise' : 'normal';
  const base   = state.settings.foods[type] || [];
  // 週六（6）和週日（0）各自查自己的 dayOverride（儲存時兩者內容相同）
  const extra  = (state.settings.dayOverride[dow] || {})[type] || [];
  // 合併：基本清單 + 該星期額外項目（去重）
  const merged = [...base];
  extra.forEach(f => { if (!merged.includes(f)) merged.push(f); });
  return merged;
}

function saveModal() {
  if (!state.modalDate) return;
  const dateStr = state.modalDate; // 先存，closeModal 會清掉 state.modalDate
  const exEl = document.getElementById('modal-exercise');
  const rec = {
    exercise: exEl.checked,
    lunch:    document.getElementById('modal-lunch').value.trim(),
    dinner:   document.getElementById('modal-dinner').value.trim(),
    cost:     document.getElementById('modal-cost').value || '',
    note:     document.getElementById('modal-note').value.trim(),
    status:   state.modalStatus,
  };
  state.records[dateStr] = rec;
  lsSave('records', state.records);
  renderCalendar();
  closeModal();
  showToast('✅ 儲存成功！');
  fbPushRecord(dateStr, rec); // 背景推送單筆（靜默）
}

function deleteModal() {
  if (!state.modalDate) return;
  const dateStr = state.modalDate;
  delete state.records[dateStr];
  lsSave('records', state.records);
  renderCalendar();
  closeModal();
  showToast('🗑️ 已清除');
  fbPushRecord(dateStr, null); // null = DELETE
}

// ─── Groups ───────────────────────────────────────────────────
function renderGroups() {
  const container = document.getElementById('group-list');
  if (!container) return;
  container.innerHTML = '';
  Object.entries(state.groups).forEach(([name, foods]) => {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `
      <div class="group-card-header">
        <span class="group-name-icon">🗂️</span>
        <input class="group-name-input" type="text" value="${name}" data-original="${name}" />
        <button class="group-rename-btn" data-group="${name}" aria-label="改名">✏️</button>
        <button class="group-delete-btn" data-group="${name}" aria-label="刪除群組">🗑️</button>
      </div>
      <div class="meal-list" id="group-foods-${CSS.escape(name)}"></div>
      <button class="add-food-btn" data-group-target="${name}" style="margin-top:4px">+ 新增餐點</button>`;
    container.appendChild(card);

    // 填入該群組的餐點 chips
    const mealList = card.querySelector(`#group-foods-${CSS.escape(name)}`);
    foods.forEach(f => addGroupChip(mealList, name, f));

    // 改名：點 ✏️ 或輸入框 blur 後確認
    const input = card.querySelector('.group-name-input');
    const renameBtn = card.querySelector('.group-rename-btn');

    function doRename() {
      const newName = input.value.trim();
      const original = input.dataset.original;
      if (!newName || newName === original) { input.value = original; return; }
      if (state.groups[newName]) { showToast('⚠️ 群組名稱已存在'); input.value = original; return; }
      // 更新 state.groups key
      const foods = state.groups[original];
      delete state.groups[original];
      state.groups[newName] = foods;
      autoSaveGroups();
      renderGroups();
    }

    renameBtn.addEventListener('click', doRename);
    input.addEventListener('blur', doRename);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });

    // 刪除整個群組
    card.querySelector('.group-delete-btn').addEventListener('click', () => {
      if (!confirm(`確定刪除群組「${name}」？`)) return;
      delete state.groups[name];
      autoSaveGroups();
      renderGroups();
    });
  });
}

function addGroupChip(container, groupName, text) {
  const chip = document.createElement('div');
  chip.className = 'meal-chip';
  chip.innerHTML = `<span>${text}</span><button class="remove-chip" aria-label="移除">×</button>`;
  chip.querySelector('.remove-chip').addEventListener('click', () => {
    chip.remove();
    // 從 state.groups 移除這個餐點
    if (state.groups[groupName]) {
      state.groups[groupName] = state.groups[groupName].filter(f => f !== text);
      autoSaveGroups();
    }
  });
  container.appendChild(chip);
}

function renderGroupSelect() {
  const sel = document.getElementById('random-group-select');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">預設</option>';
  Object.keys(state.groups).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    sel.appendChild(opt);
  });
  // 保留原本選的
  if (current && state.groups[current]) sel.value = current;
}

// ─── Random Pick ──────────────────────────────────────────────
function randomPick() {
  const today      = new Date();
  const todayStr   = formatDate(today.getFullYear(), today.getMonth(), today.getDate());
  const isExercise = !!(state.records[todayStr] || {}).exercise;
  const groupSel   = document.getElementById('random-group-select');
  const groupName  = groupSel ? groupSel.value : '';

  let foods;
  if (groupName && state.groups[groupName] && state.groups[groupName].length > 0) {
    // 指定群組模式：只從該群組選
    foods = state.groups[groupName];
  } else {
    // 預設模式：照原本邏輯，從當天可選清單選
    foods = getFoodsForDay(today.getDay(), isExercise);
  }

  if (!foods.length) { showToast('⚠️ 沒有可選餐點！'); return; }
  document.getElementById('random-food-name').textContent = foods[Math.floor(Math.random() * foods.length)];
  document.getElementById('random-result').classList.remove('hidden');
}

// ─── Settings ────────────────────────────────────────────────
function renderSettings() {
  ['exercise','normal'].forEach(k => {
    const el = document.getElementById(`food-${k}`);
    if (!el) return;
    el.innerHTML = '';
    (state.settings.foods[k] || []).forEach(f => addChip(el, k, f));
  });
  document.querySelectorAll('[data-override-dow]').forEach(el => {
    el.innerHTML = '';
    const dow  = el.dataset.overrideDow;
    const type = el.dataset.overrideMeal;
    // 'weekend' 卡片：顯示 dayOverride[0]（日）的資料作為代表
    // 儲存時 collectSettingsFromDOM 會同步寫入 dayOverride[0] 和 dayOverride[6]
    const lookupDow = dow === 'weekend' ? '0' : dow;
    ((state.settings.dayOverride[lookupDow] || {})[type] || []).forEach(f =>
      addChip(el, `override-${dow}-${type}`, f)
    );
  });
}

function addChip(container, key, text) {
  const chip = document.createElement('div');
  chip.className = 'meal-chip';
  chip.innerHTML = `<span>${text}</span><button class="remove-chip" aria-label="移除">×</button>`;
  chip.querySelector('.remove-chip').addEventListener('click', () => {
    chip.remove();
    autoSaveSettings();
  });
  container.appendChild(chip);
}

// setupDayOverrides: 只在 init() 呼叫一次，建立 DOM 骨架
// 星期六（6）和星期日（0）合併為一張「週六、日」卡片，dow key 用 'weekend'
// collectSettingsFromDOM 讀到 'weekend' 時會同時寫入 dayOverride[0] 和 dayOverride[6]
function setupDayOverrides() {
  const container = document.getElementById('day-overrides');
  if (!container) return;
  container.innerHTML = '';

  // 順序：一、二、三、四、五、週六日
  const entries = [
    { label: '星期一', dow: '1' },
    { label: '星期二', dow: '2' },
    { label: '星期三', dow: '3' },
    { label: '星期四', dow: '4' },
    { label: '星期五', dow: '5' },
    { label: '週六、日', dow: 'weekend' },  // 合併卡片
  ];

  entries.forEach(({ label, dow }) => {
    const card = document.createElement('div');
    card.className = 'day-override-card';
    card.innerHTML = `
      <h4>${label}</h4>
      <p class="override-hint">留空則只用基本清單；有填則額外新增選項</p>
      <div class="toggle-label" style="font-size:0.78rem;margin-bottom:3px">🏃 運動</div>
      <div class="meal-list" data-override-dow="${dow}" data-override-meal="exercise"></div>
      <button class="add-food-btn" data-target="override-${dow}-exercise" style="margin-bottom:7px">+ 新增</button>
      <div class="toggle-label" style="font-size:0.78rem;margin-bottom:3px">🛋️ 一般</div>
      <div class="meal-list" data-override-dow="${dow}" data-override-meal="normal"></div>
      <button class="add-food-btn" data-target="override-${dow}-normal">+ 新增</button>`;
    container.appendChild(card);
  });
}

// 即時自動儲存（新增/刪除 chip 後自動呼叫）
function autoSaveSettings() {
  collectSettingsFromDOM();
  lsSave('settings', state.settings);
  fbPushSettings(); // 背景推送（靜默）
}

function autoSaveGroups() {
  lsSave('groups', state.groups);
  // 背景推送 groups 至 Firebase
  if (hasFbCfg()) {
    fbFetch('groups', 'PUT', state.groups).catch(e => console.warn('[fbPushGroups]', e));
  }
  // 更新隨機選餐下拉選單
  renderGroupSelect();
}

function saveSettings() {
  autoSaveSettings();
  showToast('✅ 設定已儲存！');
}

// ─── Excel Export ─────────────────────────────────────────────
function exportExcel() {
  const wb = XLSX.utils.book_new();

  const recHeaders = ['日期','星期','午餐','晚餐','花費(元)','備註','運動日','狀態'];
  const recRows = Object.entries(state.records)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([dateStr, rec]) => {
      const [y,m,d] = dateStr.split('-').map(Number);
      return [dateStr, `星期${DAY_NAMES[new Date(y,m-1,d).getDay()]}`,
        rec.lunch||'', rec.dinner||'',
        rec.cost ? Number(rec.cost) : '', rec.note||'',
        rec.exercise ? '是' : '否',
        rec.status === 'planned' ? '預計' : '已吃'];
    });
  const wsRec = XLSX.utils.aoa_to_sheet([recHeaders, ...recRows]);
  wsRec['!cols'] = [14,10,18,18,10,20,8,8].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsRec, '飲食記錄');

  const settRows = [['運動狀態','餐點']];
  const settMap = { 'exercise':'運動日', 'normal':'非運動日' };
  Object.entries(settMap).forEach(([k, label]) => {
    (state.settings.foods[k]||[]).forEach(f => settRows.push([label, f]));
  });
  const wsSet = XLSX.utils.aoa_to_sheet(settRows);
  wsSet['!cols'] = [12,22].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsSet, '餐點設定');

  const ovRows = [['星期','運動狀態','餐點']];
  Object.entries(state.settings.dayOverride).forEach(([dow, obj]) => {
    const label = `星期${DAY_NAMES[Number(dow)]}`;
    (obj.exercise||[]).forEach(f => ovRows.push([label,'運動日',f]));
    (obj.normal||[]).forEach(f   => ovRows.push([label,'非運動日',f]));
  });
  const wsOv = XLSX.utils.aoa_to_sheet(ovRows);
  wsOv['!cols'] = [12,12,22].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsOv, '星期覆蓋設定');

  const months = {};
  Object.entries(state.records).forEach(([ds,rec]) => {
    const ym = ds.slice(0,7);
    if (!months[ym]) months[ym] = {records:0,exercise:0,cost:0,lunch:0,dinner:0};
    if (rec.lunch||rec.dinner) months[ym].records++;
    if (rec.exercise) months[ym].exercise++;
    if (rec.cost) months[ym].cost += Number(rec.cost)||0;
    if (rec.lunch)  months[ym].lunch++;
    if (rec.dinner) months[ym].dinner++;
  });
  const statHeaders = ['年月','記錄天數','運動天數','午餐次數','晚餐次數','總花費(元)'];
  const statRows = Object.entries(months).sort(([a],[b])=>a.localeCompare(b))
    .map(([ym,s])=>[ym,s.records,s.exercise,s.lunch,s.dinner,s.cost]);
  const wsStat = XLSX.utils.aoa_to_sheet([statHeaders,...statRows]);
  wsStat['!cols'] = [12,10,10,10,10,12].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsStat, '月份統計');

  // Sheet 5: 群組設定
  const grpRows = [['群組名稱','餐點']];
  Object.entries(state.groups).forEach(([name, foods]) => {
    foods.forEach(f => grpRows.push([name, f]));
  });
  const wsGrp = XLSX.utils.aoa_to_sheet(grpRows);
  wsGrp['!cols'] = [16,22].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsGrp, '群組設定');

  const now = new Date();
  XLSX.writeFile(wb, `eatwhat_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.xlsx`);
  showToast('✅ 已匯出 Excel！');
}

// ─── Excel Import ─────────────────────────────────────────────
function handleImport(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const parsed = { records: {}, settings: emptySettings() };

      if (wb.SheetNames.includes('飲食記錄')) {
        XLSX.utils.sheet_to_json(wb.Sheets['飲食記錄'], { header:1 }).slice(1).forEach(row => {
          if (!row[0]) return;
          const ds = String(row[0]).trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return;
          parsed.records[ds] = {
            lunch: String(row[2]||'').trim(), dinner: String(row[3]||'').trim(),
            cost:  row[4] != null ? String(row[4]) : '', note: String(row[5]||'').trim(),
            exercise: String(row[6]||'') === '是',
            status:   String(row[7]||'') === '預計' ? 'planned' : 'actual',
          };
        });
      }

      if (wb.SheetNames.includes('餐點設定')) {
        const m = { '運動日':'exercise', '非運動日':'normal' };
        XLSX.utils.sheet_to_json(wb.Sheets['餐點設定'], { header:1 }).slice(1).forEach(row => {
          // 新格式：col0=運動狀態, col1=餐點
          // 舊格式相容：col0=分類, col1=運動狀態, col2=餐點
          let typeLabel, food;
          if (row[2] !== undefined && row[2] !== '') {
            // 舊格式（3欄）
            typeLabel = String(row[1]||'').trim();
            food      = String(row[2]||'').trim();
          } else {
            // 新格式（2欄）
            typeLabel = String(row[0]||'').trim();
            food      = String(row[1]||'').trim();
          }
          const k = m[typeLabel];
          if (k && food && !parsed.settings.foods[k].includes(food)) parsed.settings.foods[k].push(food);
        });
      }

      if (wb.SheetNames.includes('星期覆蓋設定')) {
        const dm = {'星期日':0,'星期一':1,'星期二':2,'星期三':3,'星期四':4,'星期五':5,'星期六':6};
        XLSX.utils.sheet_to_json(wb.Sheets['星期覆蓋設定'], { header:1 }).slice(1).forEach(row => {
          const dow  = dm[String(row[0]||'').trim()];
          const ex   = String(row[1]||'').trim();
          const food = String(row[2]||'').trim();
          if (dow == null || !food) return;
          if (!parsed.settings.dayOverride[dow]) parsed.settings.dayOverride[dow] = {};
          const type = ex === '運動日' ? 'exercise' : 'normal';
          if (!parsed.settings.dayOverride[dow][type]) parsed.settings.dayOverride[dow][type] = [];
          if (!parsed.settings.dayOverride[dow][type].includes(food))
            parsed.settings.dayOverride[dow][type].push(food);
        });
      }

      // 群組設定
      parsed.groups = {};
      if (wb.SheetNames.includes('群組設定')) {
        XLSX.utils.sheet_to_json(wb.Sheets['群組設定'], { header:1 }).slice(1).forEach(row => {
          const name = String(row[0]||'').trim();
          const food = String(row[1]||'').trim();
          if (!name || !food) return;
          if (!parsed.groups[name]) parsed.groups[name] = [];
          if (!parsed.groups[name].includes(food)) parsed.groups[name].push(food);
        });
      }

      state.importBuffer = parsed;
      showImportPreview(parsed);
    } catch (err) {
      showToast('❌ 無法解析 Excel，請確認格式正確');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

function showImportPreview(parsed) {
  const recCount  = Object.keys(parsed.records).length;
  const foodCount = Object.values(parsed.settings.foods).reduce((s,a)=>s+a.length,0);
  const ovCount   = Object.values(parsed.settings.dayOverride).reduce((s,o)=>s+(o.exercise||[]).length+(o.normal||[]).length,0);
  const dates     = Object.keys(parsed.records).sort();
  const previewRows = dates.slice(0,5).map(d => {
    const r = parsed.records[d];
    return `<tr><td>${d}</td><td>${r.lunch||'-'}</td><td>${r.dinner||'-'}</td><td>${r.cost?'NT$'+r.cost:'-'}</td><td>${r.exercise?'🏃':'–'}</td></tr>`;
  }).join('');

  document.getElementById('preview-content').innerHTML = `
    <p>📅 飲食記錄：<strong>${recCount}</strong> 筆${dates.length?` （${dates[0]} 〜 ${dates[dates.length-1]}）`:''}</p>
    <p>🍽️ 餐點設定：<strong>${foodCount}</strong> 項　📋 星期覆蓋：<strong>${ovCount}</strong> 項</p>
    ${recCount > 0 ? `<table style="margin-top:12px">
      <tr><th>日期</th><th>午餐</th><th>晚餐</th><th>花費</th><th>運動</th></tr>
      ${previewRows}
      ${recCount > 5 ? `<tr><td colspan="5" style="text-align:center;color:#8a7a6e">… 還有 ${recCount-5} 筆</td></tr>` : ''}
    </table>` : ''}
    <p style="margin-top:12px;color:#c44;font-weight:700">⚠️ 匯入後將覆蓋現有所有資料，請確認後再繼續。</p>`;

  document.getElementById('import-preview').classList.remove('hidden');
  document.getElementById('import-preview').scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function applyImport() {
  if (!state.importBuffer) return;
  state.records  = state.importBuffer.records;
  state.settings = state.importBuffer.settings;
  if (state.importBuffer.groups) state.groups = state.importBuffer.groups;
  state.importBuffer = null;
  lsSave('records',  state.records);
  lsSave('settings', state.settings);
  lsSave('groups',   state.groups);
  document.getElementById('import-preview').classList.add('hidden');
  document.getElementById('import-excel').value = '';
  renderCalendar();
  renderSettings();
  renderGroups();
  renderGroupSelect();
  showToast('✅ 匯入成功！');
}

function cancelImport() {
  state.importBuffer = null;
  document.getElementById('import-preview').classList.add('hidden');
  document.getElementById('import-excel').value = '';
}

// ─── Firebase：手動拉取 ───────────────────────────────────────
// 儲存 config → 嘗試拉取 → 寫入本機 → 清除 config（不保持連線）
async function fbPull() {
  const url = document.getElementById('firebase-url').value.trim();
  const key = document.getElementById('firebase-key').value.trim();
  if (!url) { showToast('⚠️ 請輸入 Firebase URL'); return; }

  state.firebaseCfg = { url, key };
  setShareStatus('loading', '⏳ 正在從 Firebase 拉取資料…');
  setShareBtnsDisabled(true);

  try {
    const [rawSett, rawRecs] = await Promise.all([
      fbFetch('settings'),
      fbFetch('records'),
    ]);

    // Firebase 對空節點回傳 null，需驗證後才存入
    const validSett = rawSett && typeof rawSett === 'object' && rawSett.foods ? rawSett : null;
    const validRecs = rawRecs && typeof rawRecs === 'object' && !Array.isArray(rawRecs) ? rawRecs : null;

    if (validSett && applySettings(validSett)) lsSave('settings', state.settings);
    if (validRecs && applyRecords(validRecs))  lsSave('records',  state.records);

    // 群組
    const rawGroups = await fbFetch('groups').catch(() => null);
    if (rawGroups && typeof rawGroups === 'object' && !Array.isArray(rawGroups)) {
      state.groups = rawGroups; lsSave('groups', rawGroups);
    }

    // 儲存 config
    localStorage.setItem('mealplan_firebase_cfg', JSON.stringify(state.firebaseCfg));

    renderCalendar();
    renderSettings();
    renderGroups();
    renderGroupSelect();

    let note;
    if (!validSett && !validRecs) {
      note = '（Firebase 資料庫尚無資料，保留本機資料）';
    } else {
      const recCount  = validRecs  ? Object.keys(validRecs).length : 0;
      const foodCount = state.settings ? Object.values(state.settings.foods).reduce((s,a) => s + a.length, 0) : 0;
      const grpCount  = Object.keys(state.groups).length;
      note = `共 ${recCount} 筆記錄、${foodCount} 項餐點設定、${grpCount} 個群組已存入本機。`;
    }
    setShareStatus('ok', `✅ 拉取成功！${note}（${new Date().toLocaleTimeString()}）`);
    showToast('☁️ Firebase 資料拉取完成！');
  } catch (err) {
    setShareStatus('err', `❌ 拉取失敗：${err.message}　請確認 URL 與資料庫規則。`);
  } finally {
    setShareBtnsDisabled(false);
  }
}

// ─── Firebase：手動推送 ───────────────────────────────────────
async function fbPush() {
  const url = document.getElementById('firebase-url').value.trim();
  const key = document.getElementById('firebase-key').value.trim();
  if (!url) { showToast('⚠️ 請輸入 Firebase URL'); return; }

  // 確認 checkbox
  const confirmEl = document.getElementById('fb-push-confirm');
  if (!confirmEl || !confirmEl.checked) {
    showToast('⚠️ 請先勾選確認才能推送');
    return;
  }
  confirmEl.checked = false; // 推送後自動取消勾選

  // 推送前先把畫面上的設定同步到 state，避免推送舊值
  collectSettingsFromDOM();

  state.firebaseCfg = { url, key };
  setShareStatus('loading', '⏳ 正在推送資料至 Firebase…');
  setShareBtnsDisabled(true);

  // 顯示將要推送的資料量，方便確認
  const recCount  = Object.keys(state.records).length;
  const foodCount = Object.values(state.settings.foods).reduce((s,a) => s + a.length, 0);

  try {
    await Promise.all([
      fbFetch('settings', 'PUT', state.settings),
      fbFetch('records',  'PUT', state.records),
      fbFetch('groups',   'PUT', state.groups),
    ]);

    // 同時更新本機，確保一致
    lsSave('settings', state.settings);
    lsSave('records',  state.records);
    lsSave('groups',   state.groups);
    localStorage.setItem('mealplan_firebase_cfg', JSON.stringify(state.firebaseCfg));

    setShareStatus('ok', `✅ 全量推送成功！共 ${recCount} 筆記錄、${foodCount} 項餐點設定。（${new Date().toLocaleTimeString()}）`);
    showToast('☁️ 資料已推送至 Firebase！');
  } catch (err) {
    setShareStatus('err', `❌ 推送失敗：${err.message}　請確認 URL 與資料庫規則。`);
  } finally {
    setShareBtnsDisabled(false);
  }
}

// 從 DOM 收集當前設定頁面的餐點，同步到 state.settings
// （不儲存到 localStorage，只更新 state，讓推送拿到最新值）
function collectSettingsFromDOM() {
  ['exercise','normal'].forEach(k => {
    const el = document.getElementById(`food-${k}`);
    if (!el) return;
    state.settings.foods[k] = Array.from(el.querySelectorAll('.meal-chip span')).map(s => s.textContent);
  });
  state.settings.dayOverride = {};
  document.querySelectorAll('[data-override-dow]').forEach(el => {
    const dow  = el.dataset.overrideDow;
    const type = el.dataset.overrideMeal;
    const arr  = Array.from(el.querySelectorAll('.meal-chip span')).map(s => s.textContent);
    if (arr.length) {
      if (dow === 'weekend') {
        // 週六、日合併卡片：同步寫入 dayOverride[0]（日）和 dayOverride[6]（六）
        ['0', '6'].forEach(d => {
          if (!state.settings.dayOverride[d]) state.settings.dayOverride[d] = {};
          state.settings.dayOverride[d][type] = [...arr];
        });
      } else {
        if (!state.settings.dayOverride[dow]) state.settings.dayOverride[dow] = {};
        state.settings.dayOverride[dow][type] = arr;
      }
    }
  });
}

function setShareStatus(type, msg) {
  const el = document.getElementById('firebase-status');
  el.className = `firebase-status ${type}`;
  el.textContent = msg;
}

function setShareBtnsDisabled(disabled) {
  ['fb-pull-btn','fb-push-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}

// 更新共用頁面的 UI 狀態（從 config 填入欄位）
function updateSharePageUI() {
  const { url, key } = state.firebaseCfg;
  const urlEl = document.getElementById('firebase-url');
  const keyEl = document.getElementById('firebase-key');
  if (urlEl) urlEl.value = url || '';
  if (keyEl) keyEl.value = key || '';
  if (url) {
    setShareStatus('info', `📋 已記憶 Firebase 設定（${url}）。資料儲存於本機，可隨時拉取或推送。`);
  } else {
    setShareStatus('local', '📦 目前使用本機儲存。填入 Firebase URL 後可與他人共用資料。');
  }
}

function clearFirebaseCfg() {
  state.firebaseCfg = { url: '', key: '' };
  localStorage.removeItem('mealplan_firebase_cfg');
  document.getElementById('firebase-url').value = '';
  document.getElementById('firebase-key').value = '';
  setShareStatus('local', '📦 已清除 Firebase 設定，使用本機儲存。');
  showToast('已清除 Firebase 設定');
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
    const parts = target.split('-');
    const container = document.querySelector(`[data-override-dow="${parts[1]}"][data-override-meal="${parts[2]}"]`);
    if (container) addChip(container, target, val);
  } else {
    const el = document.getElementById(`food-${target}`);
    if (el) addChip(el, target, val);
  }
  closeAddFood();
  autoSaveSettings();
}

// ─── Dice ─────────────────────────────────────────────────────
function diceForMeal(mealType) {
  if (!state.modalDate) return;
  const [y,m,d] = state.modalDate.split('-').map(Number);
  const dow = new Date(y,m-1,d).getDay();
  const isExercise = document.getElementById('modal-exercise').checked;
  const foods = getFoodsForDay(dow, isExercise);
  if (!foods.length) { showToast('⚠️ 沒有可選餐點！'); return; }

  // 收集需要排除的餐點：
  // 1. 當天另一餐（午晚不重複）
  // 2. 前一天的午餐和晚餐
  // 3. 後一天的午餐和晚餐
  const excluded = new Set();

  const otherMeal = mealType === 'lunch' ? 'dinner' : 'lunch';
  const otherVal = document.getElementById(`modal-${otherMeal}`)?.value?.trim();
  if (otherVal) excluded.add(otherVal);

  const dateObj = new Date(y, m-1, d);
  [-1, 1].forEach(offset => {
    const adj = new Date(dateObj);
    adj.setDate(adj.getDate() + offset);
    const adjStr = formatDate(adj.getFullYear(), adj.getMonth(), adj.getDate());
    const adjRec = state.records[adjStr];
    if (adjRec) {
      if (adjRec.lunch)  excluded.add(adjRec.lunch);
      if (adjRec.dinner) excluded.add(adjRec.dinner);
    }
  });

  // 優先從排除名單以外選；若全部都在排除名單則放寬限制隨機選
  const available = foods.filter(f => !excluded.has(f));
  const pool = available.length > 0 ? available : foods;

  if (pool.length === 0) { showToast('⚠️ 沒有可選餐點！'); return; }
  if (available.length === 0) showToast('⚠️ 餐點太少，無法完全避免重複');

  const pick = pool[Math.floor(Math.random() * pool.length)];
  const inp = document.getElementById(`modal-${mealType}`);
  if (inp) inp.value = pick;
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
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
    if (--state.month < 0) { state.month = 11; state.year--; } renderCalendar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    if (++state.month > 11) { state.month = 0; state.year++; } renderCalendar();
  });
  document.getElementById('today-btn').addEventListener('click', () => {
    const n = new Date(); state.year = n.getFullYear(); state.month = n.getMonth(); renderCalendar();
  });

  // Random
  document.getElementById('random-btn').addEventListener('click', randomPick);
  document.getElementById('random-close').addEventListener('click', () => {
    document.getElementById('random-result').classList.add('hidden');
  });

  // Day modal
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveModal);
  document.getElementById('modal-delete').addEventListener('click', deleteModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Status buttons
  document.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => { state.modalStatus = btn.dataset.status; updateStatusBtns(); });
  });

  // Dice buttons
  document.querySelectorAll('.dice-btn').forEach(btn => {
    btn.addEventListener('click', () => diceForMeal(btn.dataset.meal));
  });

  // Add food (delegated)，排除群組內的新增餐點按鈕
  document.addEventListener('click', e => {
    if (e.target.classList.contains('add-food-btn') && !e.target.dataset.groupTarget)
      openAddFood(e.target.dataset.target);
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


  // Firebase pull / push / clear
  document.getElementById('fb-pull-btn').addEventListener('click', fbPull);
  document.getElementById('fb-push-btn').addEventListener('click', fbPush);
  document.getElementById('fb-clear-btn').addEventListener('click', clearFirebaseCfg);

  // Excel
  document.getElementById('export-excel').addEventListener('click', exportExcel);
  document.getElementById('import-excel').addEventListener('change', e => {
    if (e.target.files[0]) handleImport(e.target.files[0]);
  });
  document.getElementById('import-confirm').addEventListener('click', applyImport);
  document.getElementById('import-cancel').addEventListener('click', cancelImport);

  // 新增群組按鈕
  document.getElementById('add-group-btn')?.addEventListener('click', () => {
    const name = prompt('請輸入群組名稱（例如：清淡組、外食組）');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (state.groups[trimmed]) { showToast('⚠️ 群組名稱已存在'); return; }
    state.groups[trimmed] = [];
    autoSaveGroups();
    renderGroups();
  });

  // 群組新增餐點（delegated）
  document.getElementById('group-list')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-group-target]');
    if (!btn) return;
    const groupName = btn.dataset.groupTarget;
    const food = prompt(`新增餐點到「${groupName}」`);
    if (!food || !food.trim()) return;
    const trimmed = food.trim();
    if (!state.groups[groupName]) state.groups[groupName] = [];
    if (state.groups[groupName].includes(trimmed)) { showToast('⚠️ 餐點已存在'); return; }
    state.groups[groupName].push(trimmed);
    autoSaveGroups();
    renderGroups();
  });

  // Esc
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('addfood-overlay').classList.contains('hidden')) closeAddFood();
    else if (!document.getElementById('modal-overlay').classList.contains('hidden')) closeModal();
  });

  // ── Pull to Refresh（下拉重新整理）──
  let ptrStartY = 0;
  let ptrDist   = 0;
  let ptrActive = false;
  const PTR_THRESHOLD = 72; // px，需要拉多遠才觸發

  // 建立提示 UI
  const ptrEl = document.createElement('div');
  ptrEl.id = 'ptr-indicator';
  ptrEl.textContent = '↓ 下拉重新整理';
  document.body.appendChild(ptrEl);

  document.addEventListener('touchstart', e => {
    // 只在頁面頂端、沒有 modal 開著的時候啟動
    if (window.scrollY > 0) return;
    if (!document.getElementById('modal-overlay').classList.contains('hidden')) return;
    if (!document.getElementById('addfood-overlay').classList.contains('hidden')) return;
    ptrStartY = e.touches[0].clientY;
    ptrActive = true;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!ptrActive) return;
    ptrDist = e.touches[0].clientY - ptrStartY;
    if (ptrDist <= 0) { ptrActive = false; return; }
    const progress = Math.min(ptrDist / PTR_THRESHOLD, 1);
    ptrEl.style.transform = `translateX(-50%) translateY(${Math.min(ptrDist * 0.4, 48)}px)`;
    ptrEl.style.opacity   = String(progress);
    ptrEl.textContent     = ptrDist >= PTR_THRESHOLD ? '↑ 放開以重新整理' : '↓ 下拉重新整理';
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!ptrActive) return;
    ptrActive = false;
    ptrEl.style.transform = '';
    ptrEl.style.opacity   = '0';
    ptrEl.textContent     = '↓ 下拉重新整理';
    if (ptrDist >= PTR_THRESHOLD) {
      ptrEl.textContent = '🔄 重新整理中…';
      ptrEl.style.opacity = '1';
      ptrEl.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => location.reload(), 300);
    }
    ptrDist = 0;
  });

  // ── 計算機 ──
  let calcExpr = '';

  function calcEvaluate() {
    try {
      const expr = calcExpr.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-');
      if (!expr) return '0';
      const result = Function('"use strict"; return (' + expr + ')')();
      if (!isFinite(result)) return 'ERROR';
      return String(Math.round(result * 100) / 100);
    } catch { return 'ERROR'; }
  }

  document.getElementById('calc-btn').addEventListener('click', () => {
    const panel = document.getElementById('calc-panel');
    panel.classList.toggle('hidden');
    calcExpr = '';
    document.getElementById('calc-display').textContent = '0';
  });

  document.querySelectorAll('.calc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const display = document.getElementById('calc-display');
      const t = btn.textContent.trim();

      if (t === 'C') {
        calcExpr = ''; display.textContent = '0';
      } else if (t === '=') {
        const result = calcEvaluate();
        display.textContent = result;
        calcExpr = result === 'ERROR' ? '' : result;
      } else if (t === '✓ 確認') {
        // 確認 = 先計算，再填入花費欄，再關閉計算機
        const result = calcEvaluate();
        if (result !== 'ERROR' && result !== '0') {
          document.getElementById('modal-cost').value = result;
        } else if (result !== 'ERROR') {
          document.getElementById('modal-cost').value = result;
        }
        display.textContent = result;
        calcExpr = result === 'ERROR' ? '' : result;
        document.getElementById('calc-panel').classList.add('hidden');
      } else {
        // 數字或運算子
        const ops = ['+', '−', '×', '÷'];
        const lastIsOp = ops.some(op => calcExpr.endsWith(op));
        const isOp = ops.includes(t) || t === '.';
        // 防止連續運算符
        if (isOp && lastIsOp && t !== '.') {
          calcExpr = calcExpr.slice(0, -1) + t;
        } else {
          calcExpr += t;
        }
        display.textContent = calcExpr;
      }
    });
  });
}

// ─── Start ────────────────────────────────────────────────────
init();
