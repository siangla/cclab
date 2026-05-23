'use strict';

// ══════════════════════════════════
// DATA
// ══════════════════════════════════
let D = { shop: [], meal: [] };
let editCtx = null;
const charts = {};

// 全域當前月份 (year, month 0-indexed)
let curYear  = new Date().getFullYear();
let curMonth = new Date().getMonth();

function save() { localStorage.setItem('kj_v4', JSON.stringify(D)); }

function load() {
  try { const s = localStorage.getItem('kj_v4'); if (s) D = JSON.parse(s); } catch(e) {}
  migrateLegacy();
  const today = todayStr();
  setVal('shop-date', today);
  setVal('meal-date', today);
  updateMonthNav();
}

function migrateLegacy() {
  ['kj3','kitchenJournal2'].forEach(key => {
    try {
      const raw = localStorage.getItem(key); if (!raw) return;
      const old = JSON.parse(raw);
      const shopIds = new Set(D.shop.map(x => x.id));
      const mealIds = new Set(D.meal.map(x => x.id));
      (old.shop||[]).forEach(s => { if (!shopIds.has(s.id)) { D.shop.push(s); shopIds.add(s.id); }});
      (old.meal||[]).forEach(m => { if (!mealIds.has(m.id)) { D.meal.push(m); mealIds.add(m.id); }});
      (old.plan||[]).forEach(p => {
        if (!mealIds.has(p.id)) {
          D.meal.push({ id:p.id, name:p.name, date:p.date||'', type:'其他',
            status: p.status==='已完成'?'已完成':p.status==='準備中'?'準備中':'計畫中',
            diff:p.diff||'', serving:p.serving||'', price:0,
            rating:'', note:p.note||'', createdAt:p.createdAt||new Date().toISOString() });
          mealIds.add(p.id);
        }
      });
    } catch(e) {}
  });
}

// ══════════════════════════════════
// UTILS
// ══════════════════════════════════
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function todayStr() { return new Date().toISOString().slice(0,10); }
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function getVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

function toast(msg, type='ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  document.getElementById('toast-wrap').appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

const ZH_MONTHS = ['一月','二月','三月','四月','五月','六月',
                   '七月','八月','九月','十月','十一月','十二月'];
const EN_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ZH_WEEK   = ['日','一','二','三','四','五','六'];

// 分類→馬卡龍顏色 index
const CAT_COLORS = {
  '蔬菜水果':0, '肉類海鮮':1, '乳製品':2, '零食飲料':3,
  '調味料':4, '乾貨罐頭':5, '冷凍食品':6, '清潔用品':7, '其他':8
};
// 餐別→馬卡龍顏色 hex (direct)
const MAC = ['#f2a7bb','#c9b8e8','#a8d8c8','#f7c59f','#a8cce8','#f5e6a3','#e8b4c8','#9fd3c7','#d4c5f0'];

// ══════════════════════════════════
// MONTH NAVIGATOR
// ══════════════════════════════════
function monthRange() {
  const first = `${curYear}-${String(curMonth+1).padStart(2,'0')}-01`;
  const last  = new Date(curYear, curMonth+1, 0);
  const lastStr = `${curYear}-${String(curMonth+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
  return { first, last: lastStr };
}

function updateMonthNav() {
  document.getElementById('month-label').textContent =
    `${curYear}年 ${ZH_MONTHS[curMonth]}`;
  // Re-render current visible tab
  const panels = ['shop','meal','analytics'];
  panels.forEach(tab => {
    if (document.getElementById('panel-'+tab).classList.contains('active')) {
      if (tab==='shop')      renderShop();
      else if (tab==='meal') renderMeal();
      else                   renderAnalytics();
    }
  });
}

function shiftMonth(delta) {
  curMonth += delta;
  if (curMonth > 11) { curMonth = 0;  curYear++; }
  if (curMonth < 0)  { curMonth = 11; curYear--; }
  updateMonthNav();
}

function goToday() {
  const now = new Date();
  curYear  = now.getFullYear();
  curMonth = now.getMonth();
  updateMonthNav();
}

// ══════════════════════════════════
// TABS
// ══════════════════════════════════
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  ['shop','meal','analytics'].forEach((t,i) => {
    if (t===tab) document.querySelectorAll('.tab')[i].classList.add('active');
  });
  const panel = document.getElementById('panel-'+tab);
  if (panel) panel.classList.add('active');
  if (tab==='shop')      renderShop();
  else if (tab==='meal') renderMeal();
  else                   renderAnalytics();
}

// ══════════════════════════════════
// SHOP
// ══════════════════════════════════
function addShop() {
  const name = getVal('shop-name').trim();
  if (!name) return toast('請輸入品項名稱','err');
  D.shop.unshift({
    id:uid(), name,
    qty:   getVal('shop-qty').trim(),
    price: parseFloat(getVal('shop-price'))||0,
    date:  getVal('shop-date')||todayStr(),
    cat:   getVal('shop-cat'),
    note:  getVal('shop-note').trim(),
    bought:false, createdAt:new Date().toISOString()
  });
  ['shop-name','shop-qty','shop-note'].forEach(id => setVal(id,''));
  setVal('shop-price','');
  save(); renderShop(); toast('已新增購物項目');
}

function toggleBought(id) {
  const x = D.shop.find(x => x.id===id);
  if (x) { x.bought = !x.bought; save(); renderShop(); }
}

function deleteShop(id) {
  D.shop = D.shop.filter(x => x.id!==id);
  save(); renderShop(); toast('已刪除');
}

function editShopOpen(id) {
  const x = D.shop.find(x => x.id===id); if (!x) return;
  editCtx = {type:'shop', id};
  document.getElementById('modal-title').textContent = '編輯購物項目';
  document.getElementById('modal-body').innerHTML = `
    <div class="fg" style="margin-bottom:.55rem">
      <label>品項名稱</label><input id="m-shop-name" value="${esc(x.name)}">
    </div>
    <div class="form-row">
      <div class="fg"><label>數量</label><input id="m-shop-qty" value="${esc(x.qty||'')}"></div>
      <div class="fg"><label>金額 (NT$)</label><input id="m-shop-price" type="number" value="${x.price||0}"></div>
      <div class="fg"><label>採購日期</label><input id="m-shop-date" type="date" value="${x.date||''}"></div>
    </div>
    <div class="form-row" style="margin-top:.45rem">
      <div class="fg"><label>分類</label><select id="m-shop-cat">${shopCatOpts(x.cat)}</select></div>
    </div>
    <div class="fg" style="margin-top:.55rem">
      <label>備註</label><input id="m-shop-note" value="${esc(x.note||'')}">
    </div>`;
  openModal();
}

function shopCatOpts(sel) {
  return ['','蔬菜水果','肉類海鮮','乳製品','零食飲料','調味料','乾貨罐頭','冷凍食品','清潔用品','其他']
    .map(c => `<option ${c===sel?'selected':''}>${c}</option>`).join('');
}

function renderShop() {
  const { first, last } = monthRange();
  const q   = getVal('shop-search').toLowerCase();
  const cat = '';
  const st  = getVal('shop-filter-status');

  // 篩選：當月 + 搜尋/分類/狀態
  let items = D.shop.filter(x => {
    const d = x.date||'';
    if (d < first || d > last) return false;  // 只顯示當月
    if (q && !x.name.toLowerCase().includes(q) && !(x.note||'').toLowerCase().includes(q)) return false;
    if (st!=='' && String(x.bought)!==st) return false;
    return true;
  });

  // stats（全月，不受搜尋篩選影響）
  const monthItems = D.shop.filter(x => (x.date||'') >= first && (x.date||'') <= last);
  const tot    = monthItems.length;
  const bgt    = monthItems.filter(x => x.bought).length;
  const totAmt = monthItems.reduce((s,x) => s+(x.price||0), 0);
  const bgtAmt = monthItems.filter(x => x.bought).reduce((s,x) => s+(x.price||0), 0);

  document.getElementById('shop-stats').innerHTML = `
    <div class="stat-chip"><strong>${tot}</strong> 項本月</div>
    <div class="stat-chip"><strong>${tot-bgt}</strong> 項待買</div>
    <div class="stat-chip hl"><strong>NT$${totAmt.toLocaleString()}</strong> 本月總額</div>
  `;

  const el = document.getElementById('shop-list');
  if (!items.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🛒</div><div class="empty-text">本月沒有購物記錄</div></div>`;
    return;
  }

  // 依日期分組（新→舊）
  const byDate = {};
  items.forEach(x => {
    const d = x.date||'未指定';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(x);
  });
  const sortedDates = Object.keys(byDate).sort((a,b) => b.localeCompare(a));

  el.innerHTML = sortedDates.map(date => {
    const dayItems = byDate[date];
    const dayTotal = dayItems.reduce((s,x) => s+(x.price||0), 0);
    const boughtN  = dayItems.filter(x => x.bought).length;

    let dateLabel = date;
    if (date !== '未指定') {
      const dp = date.split('-');
      const wd = ZH_WEEK[new Date(date).getDay()];
      dateLabel = `${dp[0]}年${parseInt(dp[1])}月${parseInt(dp[2])}日（週${wd}）`;
    }

    const cards = dayItems.map(x => {
      const ci = CAT_COLORS[x.cat] ?? 8;
      return `
      <div class="shop-card ${x.bought?'bought':''}">
        <div class="chk ${x.bought?'on':''}" onclick="toggleBought('${x.id}')">${x.bought?'✓':''}</div>
        <div class="item-body">
          <div class="item-name">
            ${esc(x.name)}${x.qty?` <span style="color:var(--ink-muted);font-weight:400;font-size:.77rem">×${esc(x.qty)}</span>`:''}
          </div>
          <div class="item-meta">
            ${x.price?`<span class="item-price">NT$${Number(x.price).toLocaleString()}</span>`:''}
            ${x.cat?`<span class="tag cat-color-${ci}">${esc(x.cat)}</span>`:''}
            ${x.note?`<span>${esc(x.note)}</span>`:''}
          </div>
        </div>
        <div class="card-acts">
          <button class="btn btn-ghost btn-sm" onclick="editShopOpen('${x.id}')">✏</button>
          <button class="btn btn-danger btn-sm" onclick="deleteShop('${x.id}')">🗑</button>
        </div>
      </div>`;
    }).join('');

    return `<div class="day-group">
      <div class="day-group-header">
        <span class="day-group-date">${dateLabel}</span>
        ${dayTotal>0?`<span class="day-group-total">NT$${dayTotal.toLocaleString()}</span>`:''}
        <span class="day-group-count">${dayItems.length}項・已買${boughtN}</span>
      </div>
      <div class="shop-grid">${cards}</div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════
// MEAL
// ══════════════════════════════════
function addMeal() {
  const name = getVal('meal-name').trim();
  if (!name) return toast('請輸入名稱','err');
  D.meal.unshift({
    id:uid(), name,
    date:    getVal('meal-date')||todayStr(),
    type:    getVal('meal-type'),
    status:  getVal('meal-status'),
    diff:    getVal('meal-diff'),
    price:   parseFloat(getVal('meal-price'))||0,
    rating:  getVal('meal-rating'),
    note:    getVal('meal-note').trim(),
    createdAt: new Date().toISOString()
  });
  ['meal-name','meal-note'].forEach(id => setVal(id,''));
  setVal('meal-price',''); setVal('meal-rating',''); setVal('meal-diff','');
  save(); renderMeal(); toast('已新增');
}

function deleteMeal(id) {
  D.meal = D.meal.filter(x => x.id!==id);
  save(); renderMeal(); toast('已刪除');
}

function setMealStatus(id, status) {
  const x = D.meal.find(x => x.id===id);
  if (x) { x.status = status; save(); renderMeal(); toast('狀態已更新'); }
}

function quickRate(id, rating) {
  const x = D.meal.find(x => x.id===id);
  if (x) { x.rating = rating; x.status = '已完成'; save(); renderMeal(); toast('評分已記錄 '+rating); }
}

function editMealOpen(id) {
  const x = D.meal.find(x => x.id===id); if (!x) return;
  editCtx = {type:'meal', id};
  document.getElementById('modal-title').textContent = '編輯飲食 / 料理';
  const types    = ['早餐','午餐','晚餐','點心','其他'];
  const statuses = ['計畫中','已完成'];
  const diffs    = ['','簡單','中等','困難'];
  const ratings  = ['','👎','⭐','⭐⭐','⭐⭐⭐','🌟🌟🌟'];
  document.getElementById('modal-body').innerHTML = `
    <div class="fg" style="margin-bottom:.55rem">
      <label>名稱</label><input id="m-meal-name" value="${esc(x.name)}">
    </div>
    <div class="form-row">
      <div class="fg"><label>日期</label><input id="m-meal-date" type="date" value="${x.date||''}"></div>
      <div class="fg"><label>餐別</label>
        <select id="m-meal-type">${types.map(t=>`<option ${t===x.type?'selected':''}>${t}</option>`).join('')}</select>
      </div>
      <div class="fg"><label>狀態</label>
        <select id="m-meal-status">${statuses.map(s=>`<option ${s===x.status?'selected':''}>${s}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row" style="margin-top:.45rem">
      <div class="fg"><label>難度</label>
        <select id="m-meal-diff">${diffs.map(d=>`<option value="${d}" ${d===x.diff?'selected':''}>${d||'—'}</option>`).join('')}</select>
      </div>
      <div class="fg"><label>金額 (NT$)</label><input id="m-meal-price" type="number" value="${x.price||0}"></div>
      <div class="fg"><label>評分</label>
        <select id="m-meal-rating">
          <option value="" ${!x.rating?'selected':''}>—</option>
          <option value="🌟🌟🌟" ${'🌟🌟🌟'===x.rating?'selected':''}>🌟🌟🌟 超好吃</option>
          <option value="⭐⭐⭐" ${'⭐⭐⭐'===x.rating?'selected':''}>⭐⭐⭐ 好吃</option>
          <option value="⭐⭐" ${'⭐⭐'===x.rating?'selected':''}>⭐⭐ 普通</option>
          <option value="⭐" ${'⭐'===x.rating?'selected':''}>⭐ 還行</option>
          <option value="👎" ${'👎'===x.rating?'selected':''}>👎 難吃</option>
        </select>
      </div>
    </div>
    <div class="fg" style="margin-top:.55rem">
      <label>食材 / 備註</label>
      <textarea id="m-meal-note" style="min-height:68px">${esc(x.note||'')}</textarea>
    </div>`;
  openModal();
}

function renderMeal() {
  const { first, last } = monthRange();
  const q    = getVal('meal-search').toLowerCase();
  const ft   = getVal('meal-filter-type');
  const fs   = getVal('meal-filter-status');

  let items = D.meal.filter(x => {
    const d = x.date||'';
    if (d < first || d > last) return false;  // 只顯示當月
    if (q && !x.name.toLowerCase().includes(q) && !(x.note||'').toLowerCase().includes(q)) return false;
    if (ft && x.type!==ft) return false;
    if (fs && x.status!==fs) return false;
    return true;
  });

  items.sort((a,b) => (b.date||'').localeCompare(a.date||''));

  // stats（全月）
  const monthMeals = D.meal.filter(x => (x.date||'')>=first && (x.date||'')<=last);
  const total   = monthMeals.length;
  const planned = monthMeals.filter(x => x.status==='計畫中').length;
  const cooking = monthMeals.filter(x => x.status==='準備中').length;
  const done    = monthMeals.filter(x => x.status==='已完成').length;
  document.getElementById('meal-stats').innerHTML = `
    <div class="stat-chip"><strong>${total}</strong> 筆本月</div>
    <div class="stat-chip"><strong>${planned}</strong> 計畫中</div>
    <div class="stat-chip hl"><strong>${done}</strong> 已完成</div>
  `;

  const el = document.getElementById('meal-list');
  if (!items.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🥘</div><div class="empty-text">本月還沒有記錄</div></div>`;
    return;
  }

  const bc  = {早餐:'bd-breakfast', 午餐:'bd-lunch', 晚餐:'bd-dinner', 點心:'bd-snack', 其他:'bd-other'};
  const sc2 = {計畫中:'bd-planned', 準備中:'bd-cooking', 已完成:'bd-done'};
  const scCard = {計畫中:'st-planned', 準備中:'st-cooking', 已完成:'st-done'};
  const diffIcon = {簡單:'🟢', 中等:'🟡', 困難:'🔴'};
  const statusLabel = {計畫中:'📌 計畫中', 準備中:'🔥 準備中', 已完成:'✅ 已完成'};
  const pillKey = {計畫中:'sp-planned', 準備中:'sp-cooking', 已完成:'sp-done'};

  el.innerHTML = items.map(x => {
    const dp     = x.date ? x.date.split('-') : ['','',''];
    const mLabel = dp[1] ? EN_MONTHS[parseInt(dp[1])-1] : '';
    const showRate = !x.rating && x.status!=='計畫中';
    const rateHTML = showRate ? `
      <div class="rate-prompt">
        <span class="rate-prompt-label">快速評分：</span>
        ${[['👎','難吃'],['⭐','還行'],['⭐⭐','普通'],['⭐⭐⭐','好吃'],['🌟🌟🌟','超好吃']].map(([r,label]) =>
          `<button class="star-btn" data-id="${x.id}" data-rating="${r}" title="${label}">${label}</button>`
        ).join('')}
      </div>` : '';

    const pills = ['計畫中','已完成'].map(s =>
      `<button class="spill ${x.status===s?pillKey[s]:''}" data-id="${x.id}" data-status="${s}">${statusLabel[s]}</button>`
    ).join('');

    return `
    <div class="mc ${scCard[x.status]||'st-planned'}">
      <div class="mc-inner">
        <div class="mc-date">
          <div class="mc-day">${dp[2]||'?'}</div>
          <div class="mc-mon">${mLabel}<br>${dp[0]}</div>
        </div>
        <div class="mc-body">
          <div class="mc-top">
            <span class="mc-name">${esc(x.name)}</span>
            <div class="mc-badges">
              <span class="badge ${bc[x.type]||'bd-other'}">${esc(x.type)}</span>
              <span class="badge ${sc2[x.status]||'bd-planned'}">${statusLabel[x.status]||esc(x.status)}</span>
            </div>
          </div>
          <div class="mc-meta">
            ${x.diff    ? `<span>${diffIcon[x.diff]||''} ${esc(x.diff)}</span>` : ''}
            ${x.price   ? `<span class="mc-price">NT$${Number(x.price).toLocaleString()}</span>` : ''}
            ${x.rating  ? `<span class="mc-rating">${x.rating}</span>` : ''}
          </div>
          ${x.note ? `<div class="mc-notes">${esc(x.note)}</div>` : ''}
          ${rateHTML}
          <div class="status-pills">${pills}</div>
          <div class="mc-acts">
            <button class="btn btn-ghost btn-sm" onclick="editMealOpen('${x.id}')">✏ 編輯</button>
            <button class="btn btn-danger btn-sm" onclick="deleteMeal('${x.id}')">🗑 刪除</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  // 事件委派（快速評分 & 狀態切換）
  el.removeEventListener('click', mealListClick);
  el.addEventListener('click', mealListClick);
}

function mealListClick(e) {
  const star = e.target.closest('.star-btn');
  if (star) { quickRate(star.dataset.id, star.dataset.rating); return; }
  const pill = e.target.closest('.spill');
  if (pill && pill.dataset.id) setMealStatus(pill.dataset.id, pill.dataset.status);
}

// ══════════════════════════════════
// ANALYTICS
// ══════════════════════════════════
function renderAnalytics() {
  const { first, last } = monthRange();
  const shopF = D.shop.filter(x => x.date && x.date>=first && x.date<=last);
  const mealF = D.meal.filter(x => x.date && x.date>=first && x.date<=last);

  const totalSpend = shopF.reduce((s,x) => s+(x.price||0), 0);
  const spendDays  = [...new Set(shopF.filter(x=>x.price>0).map(x=>x.date))].length;
  const avgDay     = spendDays ? Math.round(totalSpend/spendDays) : 0;
  const maxD       = getMaxDay(shopF);

  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi ac">
      <div class="kpi-label">本月總花費</div>
      <div class="kpi-val">$${totalSpend.toLocaleString()}</div>
      <div class="kpi-sub">NT 新台幣</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">採購天數</div>
      <div class="kpi-val">${spendDays}</div>
      <div class="kpi-sub">有花費的天</div>
    </div>
    <div class="kpi ac-amber">
      <div class="kpi-label">日均花費</div>
      <div class="kpi-val">$${avgDay.toLocaleString()}</div>
      <div class="kpi-sub">元 / 天</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">最高單日</div>
      <div class="kpi-val">$${maxD.amt.toLocaleString()}</div>
      <div class="kpi-sub">${maxD.date||'—'}</div>
    </div>
    <div class="kpi ac-sage">
      <div class="kpi-label">飲食/料理筆數</div>
      <div class="kpi-val">${mealF.length}</div>
      <div class="kpi-sub">本月</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">已完成料理</div>
      <div class="kpi-val">${mealF.filter(x=>x.status==='已完成').length}</div>
      <div class="kpi-sub">筆</div>
    </div>
  `;

  drawDailyChart(shopF, first, last);
  drawCatChart(shopF);
  drawRatingChart(mealF);
  drawMealTypeChart(mealF);
}

function getMaxDay(items) {
  const m = {};
  items.forEach(x => { if (x.price>0) m[x.date]=(m[x.date]||0)+x.price; });
  let max = {date:'', amt:0};
  Object.entries(m).forEach(([d,a]) => { if (a>max.amt) max={date:d,amt:a}; });
  return max;
}

function getDailySpend(items, from, to) {
  if (!from||!to) return {labels:[], data:[]};
  const m = {};
  items.forEach(x => { if (x.price>0) m[x.date]=(m[x.date]||0)+x.price; });
  const labels=[], vals=[];
  const cur=new Date(from), end=new Date(to);
  while (cur<=end) {
    const d=cur.toISOString().slice(0,10);
    labels.push(String(cur.getDate())); // just day number
    vals.push(m[d]||0);
    cur.setDate(cur.getDate()+1);
  }
  return {labels, data:vals};
}

function dc(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function drawDailyChart(items, from, to) {
  dc('daily');
  const {labels, data} = getDailySpend(items, from, to);
  const ctx = document.getElementById('ch-daily');
  if (ctx) charts['daily'] = new LineChart(ctx, labels, data, MAC[0]);
}

function drawCatChart(items) {
  dc('cat');
  const m = {};
  items.forEach(x => { const c=x.cat||'其他'; m[c]=(m[c]||0)+(x.price||0); });
  const ent = Object.entries(m).sort((a,b) => b[1]-a[1]);
  const ctx = document.getElementById('ch-cat');
  if (ctx) charts['cat'] = new PieChart(ctx,
    ent.map(e=>e[0]),
    ent.map(e=>e[1]),
    ent.map(e=>MAC[CAT_COLORS[e[0]]??8])
  );
}

function drawRatingChart(items) {
  dc('rating');
  const lbs   = ['👎','⭐','⭐⭐','⭐⭐⭐','🌟🌟🌟'];
  const vals  = lbs.map(l => items.filter(x=>x.rating===l).length);
  const cols  = [MAC[0], MAC[3], MAC[5], MAC[2], MAC[4]]; // pink→peach→lemon→mint→sky
  const ctx = document.getElementById('ch-rating');
  if (ctx) charts['rating'] = new BarChart(ctx, lbs, vals, cols);
}

function drawMealTypeChart(items) {
  dc('mealtype');
  const lbs  = ['早餐','午餐','晚餐','點心','其他'];
  const vals = lbs.map(t => items.filter(x=>x.type===t).length);
  // same color mapping as bd-* badges
  const cols = [MAC[0], MAC[1], MAC[2], MAC[3], MAC[4]];
  const ctx = document.getElementById('ch-mealtype');
  if (ctx) charts['mealtype'] = new PieChart(ctx, lbs, vals, cols);
}

// ══════════════════════════════════
// CHARTS
// ══════════════════════════════════
const DPR = () => window.devicePixelRatio||1;
const FONT = '10px "Microsoft JhengHei",sans-serif';

class LineChart {
  constructor(canvas, labels, data, color) {
    this.canvas=canvas; this.labels=labels; this.data=data; this.color=color; this.draw();
  }
  destroy() {}
  draw() {
    const c=this.canvas, ctx=c.getContext('2d');
    const W=c.offsetWidth||300, H=200;
    c.width=W*DPR(); c.height=H*DPR(); ctx.scale(DPR(),DPR());
    const p={t:16,r:12,b:30,l:48};
    const w=W-p.l-p.r, h=H-p.t-p.b;
    const d=this.data, n=d.length, max=Math.max(...d,1);
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='#ede8e0'; ctx.lineWidth=1;
    for (let i=0;i<=4;i++) {
      const y=p.t+h*(1-i/4);
      ctx.beginPath(); ctx.moveTo(p.l,y); ctx.lineTo(p.l+w,y); ctx.stroke();
      ctx.fillStyle='#bbb'; ctx.font=FONT; ctx.textAlign='right';
      ctx.fillText((max*i/4).toFixed(0), p.l-4, y+4);
    }
    if (!n) return;
    const xs=w/Math.max(n-1,1);
    const grd=ctx.createLinearGradient(0,p.t,0,p.t+h);
    grd.addColorStop(0, this.color+'55'); grd.addColorStop(1, this.color+'00');
    ctx.beginPath(); ctx.moveTo(p.l,p.t+h);
    d.forEach((v,i) => ctx.lineTo(p.l+i*xs, p.t+h*(1-v/max)));
    ctx.lineTo(p.l+(n-1)*xs,p.t+h); ctx.closePath();
    ctx.fillStyle=grd; ctx.fill();
    ctx.beginPath(); ctx.strokeStyle=this.color; ctx.lineWidth=2; ctx.lineJoin='round';
    d.forEach((v,i) => i?ctx.lineTo(p.l+i*xs,p.t+h*(1-v/max)):ctx.moveTo(p.l,p.t+h*(1-v/max)));
    ctx.stroke();
    d.forEach((v,i) => {
      if (!v) return;
      ctx.beginPath(); ctx.arc(p.l+i*xs,p.t+h*(1-v/max),3,0,Math.PI*2);
      ctx.fillStyle='#fff'; ctx.fill();
      ctx.strokeStyle=this.color; ctx.lineWidth=1.8; ctx.stroke();
    });
    const step=Math.ceil(n/10);
    ctx.fillStyle='#bbb'; ctx.font=FONT; ctx.textAlign='center';
    this.labels.forEach((l,i) => { if (i%step===0||i===n-1) ctx.fillText(l,p.l+i*xs,p.t+h+12); });
  }
}

class BarChart {
  constructor(canvas, labels, data, colors) {
    this.canvas=canvas; this.labels=labels; this.data=data;
    this.colors=Array.isArray(colors)?colors:[colors]; this.draw();
  }
  destroy() {}
  draw() {
    const c=this.canvas, ctx=c.getContext('2d');
    const W=c.offsetWidth||280, H=200;
    c.width=W*DPR(); c.height=H*DPR(); ctx.scale(DPR(),DPR());
    const p={t:16,r:10,b:38,l:26};
    const w=W-p.l-p.r, h=H-p.t-p.b;
    const d=this.data, n=d.length, max=Math.max(...d,1);
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='#ede8e0'; ctx.lineWidth=1;
    for (let i=0;i<=4;i++) {
      const y=p.t+h*(1-i/4);
      ctx.beginPath(); ctx.moveTo(p.l,y); ctx.lineTo(p.l+w,y); ctx.stroke();
    }
    const bw=w/n*0.58, gap=w/n;
    d.forEach((v,i) => {
      const x=p.l+i*gap+(gap-bw)/2, bh=h*v/max, y=p.t+h-bh;
      ctx.fillStyle=this.colors[i%this.colors.length];
      ctx.beginPath(); ctx.roundRect(x,y,bw,bh,4); ctx.fill();
      ctx.fillStyle='#999'; ctx.font=FONT; ctx.textAlign='center';
      ctx.fillText(this.labels[i], x+bw/2, p.t+h+13);
      if (v) { ctx.fillStyle='#888'; ctx.fillText(v, x+bw/2, y-4); }
    });
  }
}

class PieChart {
  constructor(canvas, labels, data, colors) {
    this.canvas=canvas; this.labels=labels; this.data=data; this.colors=colors; this.draw();
  }
  destroy() {}
  draw() {
    const c=this.canvas, ctx=c.getContext('2d');
    const W=c.offsetWidth||280, H=200;
    c.width=W*DPR(); c.height=H*DPR(); ctx.scale(DPR(),DPR());
    const total=this.data.reduce((s,v)=>s+v,0);
    if (!total) {
      ctx.fillStyle='#ccc'; ctx.font='12px Microsoft JhengHei'; ctx.textAlign='center';
      ctx.fillText('暫無資料',W/2,H/2); return;
    }
    const cx=W*0.33, cy=H/2, r=Math.min(W*0.26,H*0.41);
    let angle=-Math.PI/2;
    this.data.forEach((v,i) => {
      if (!v) return;
      const sl=2*Math.PI*v/total;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,angle,angle+sl); ctx.closePath();
      ctx.fillStyle=this.colors[i%this.colors.length]; ctx.fill();
      ctx.strokeStyle='#fffdf9'; ctx.lineWidth=2; ctx.stroke();
      angle+=sl;
    });
    ctx.beginPath(); ctx.arc(cx,cy,r*0.47,0,Math.PI*2);
    ctx.fillStyle='#fffdf9'; ctx.fill();
    const lx=W*0.62;
    const valid=this.labels.map((l,i)=>({l,v:this.data[i],c:this.colors[i%this.colors.length]})).filter(x=>x.v>0);
    const startY=cy-valid.length*9.5;
    valid.forEach((item,li) => {
      const y=startY+li*19;
      ctx.fillStyle=item.c; ctx.fillRect(lx,y-8,10,10);
      ctx.fillStyle='#666'; ctx.font='10px Microsoft JhengHei,sans-serif'; ctx.textAlign='left';
      ctx.fillText(`${item.l} ${Math.round(item.v/total*100)}%`, lx+13, y+2);
    });
  }
}

// ══════════════════════════════════
// MODAL
// ══════════════════════════════════
function openModal() {
  document.getElementById('modal-ov').classList.add('open');
  setTimeout(() => { const f=document.querySelector('#modal-body input'); if(f) f.focus(); }, 80);
}
function closeModal() {
  document.getElementById('modal-ov').classList.remove('open'); editCtx=null;
}
function saveModal() {
  if (!editCtx) return;
  if (editCtx.type==='shop') {
    const x=D.shop.find(x=>x.id===editCtx.id);
    if (x) {
      x.name  = getVal('m-shop-name').trim()||x.name;
      x.qty   = getVal('m-shop-qty').trim();
      x.price = parseFloat(getVal('m-shop-price'))||0;
      x.date  = getVal('m-shop-date');
      x.cat   = getVal('m-shop-cat');
      x.note  = getVal('m-shop-note').trim();
    }
    save(); renderShop();
  } else if (editCtx.type==='meal') {
    const x=D.meal.find(x=>x.id===editCtx.id);
    if (x) {
      x.name    = getVal('m-meal-name').trim()||x.name;
      x.date    = getVal('m-meal-date');
      x.type    = getVal('m-meal-type');
      x.status  = getVal('m-meal-status');
      x.diff    = getVal('m-meal-diff');
      x.price   = parseFloat(getVal('m-meal-price'))||0;
      x.rating  = getVal('m-meal-rating');
      x.note    = getVal('m-meal-note').trim();
    }
    save(); renderMeal();
  }
  toast('已儲存'); closeModal();
}

// ══════════════════════════════════
// EXCEL
// ══════════════════════════════════
function exportExcel() {
  const wb = XLSX.utils.book_new();
  // uid 欄位放在最後，不顯示於介面，用於匯入去重
  const ws1 = XLSX.utils.aoa_to_sheet([
    ['品項名稱','數量','金額(NT$)','採購日期','分類','優先','備註','已購買','建立時間','uid'],
    ...D.shop.map(x=>[x.name,x.qty,x.price||0,x.date,x.cat,x.pri,x.note,x.bought?'是':'否',x.createdAt,x.id])
  ]);
  ws1['!cols']=[{wch:20},{wch:8},{wch:10},{wch:12},{wch:12},{wch:8},{wch:25},{wch:8},{wch:22},{wch:16}];
  XLSX.utils.book_append_sheet(wb,ws1,'購物清單');

  const ws2 = XLSX.utils.aoa_to_sheet([
    ['名稱','日期','餐別','狀態','難度','份數','金額(NT$)','評分','備註','建立時間','uid'],
    ...D.meal.map(x=>[x.name,x.date,x.type,x.status,x.diff,x.serving,x.price||0,x.rating,x.note,x.createdAt,x.id])
  ]);
  ws2['!cols']=[{wch:20},{wch:12},{wch:8},{wch:10},{wch:8},{wch:10},{wch:10},{wch:14},{wch:40},{wch:22},{wch:16}];
  XLSX.utils.book_append_sheet(wb,ws2,'飲食與料理');

  XLSX.writeFile(wb, `廚房日記_${todayStr()}.xlsx`);
  toast('Excel 已匯出 ✓');
}

function importExcel(e) {
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload = ev => {
    try {
      const wb=XLSX.read(ev.target.result,{type:'binary'});
      let imp={shop:0,meal:0,skip:0};

      // 用 uid 做去重集合
      const shopIds = new Set(D.shop.map(x=>x.id));
      const mealIds = new Set(D.meal.map(x=>x.id));

      const ws1=wb.Sheets['購物清單'];
      if(ws1) XLSX.utils.sheet_to_json(ws1,{header:1,defval:''}).slice(1).forEach(r=>{
        if(!r[0]) return;
        // r[9] = uid 欄（新格式），若為空則產生新 uid
        const rowId = String(r[9]||'').trim() || uid();
        if (shopIds.has(rowId)) { imp.skip++; return; }  // 已存在，跳過
        shopIds.add(rowId);
        D.shop.push({id:rowId, name:String(r[0]), qty:String(r[1]||''),
          price:parseFloat(r[2])||0, date:String(r[3]||''),
          cat:String(r[4]||''), pri:String(r[5]||'一般'),
          note:String(r[6]||''), bought:r[7]==='是',
          createdAt:String(r[8]||new Date().toISOString())});
        imp.shop++;
      });

      const ws2=wb.Sheets['飲食與料理'];
      if(ws2) XLSX.utils.sheet_to_json(ws2,{header:1,defval:''}).slice(1).forEach(r=>{
        if(!r[0]) return;
        // r[10] = uid 欄（新格式）
        const rowId = String(r[10]||'').trim() || uid();
        if (mealIds.has(rowId)) { imp.skip++; return; }  // 已存在，跳過
        mealIds.add(rowId);
        D.meal.push({id:rowId, name:String(r[0]), date:String(r[1]||''),
          type:String(r[2]||'其他'), status:String(r[3]||'已完成'),
          diff:String(r[4]||''), serving:String(r[5]||''),
          price:parseFloat(r[6])||0, rating:String(r[7]||''),
          note:String(r[8]||''), createdAt:String(r[9]||new Date().toISOString())});
        imp.meal++;
      });

      save(); renderShop(); renderMeal();
      const skipMsg = imp.skip>0 ? `，略過重複 ${imp.skip} 筆` : '';
      toast(`匯入成功：購物 ${imp.shop} 項、飲食/料理 ${imp.meal} 筆${skipMsg} ✓`,'ok');
    } catch(err) { toast('匯入失敗，請確認檔案格式','err'); console.error(err); }
    e.target.value='';
  };
  reader.readAsBinaryString(file);
}

// ══════════════════════════════════
// INIT
// ══════════════════════════════════
window.addEventListener('resize', () => {
  if (document.getElementById('panel-analytics').classList.contains('active')) renderAnalytics();
});

load();
save();
renderShop();
