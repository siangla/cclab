/* ── Bella's Space · app.js ── */

// ── DEFAULT DATA ──────────────────────────────────────────────
const DEFAULT_DATA = {
  settings: {
    title: "Bella's Space",
    tagline: "在實務中學習，在開發中成長",
    theme: "macaron-pink",
    showClock: true,
    bgBrightness: 50
  },
  sections: [
    {
      id: "common", title: "常用",
      bookmarks: [
        { id: "bm-1", name: "104 人力銀行", url: "https://www.104.com.tw", desc: "求職平台，職缺搜尋", color: "#d4829a" },
        { id: "bm-2", name: "Oracle JDE", url: "https://www.oracle.com/applications/jd-edwards/", desc: "JD Edwards ERP 官方文件", color: "#7aaec8" },
        { id: "bm-3", name: "GitHub", url: "https://github.com", desc: "程式碼版本控制", color: "#86c4a4" },
        { id: "bm-4", name: "Stack Overflow", url: "https://stackoverflow.com", desc: "工程師的救命繩", color: "#e8a87a" },
        { id: "bm-5", name: "ChatGPT", url: "https://chatgpt.com", desc: "AI 助理", color: "#86c4a4" },
        { id: "bm-6", name: "Claude", url: "https://claude.ai", desc: "Anthropic AI 助理", color: "#a890d0" }
      ]
    }
  ]
};

const ACCENT_COLORS = [
  "#d4829a","#a890d0","#7aaec8","#86c4a4","#e8c87a",
  "#e8a87a","#c8a0d4","#82c0e0","#f0b8c8","#a8d0b8"
];

// ── MACARON THEME DEFINITIONS ─────────────────────────────────
// Each theme: hue, base saturation for bg (low), accent saturation (vivid)
// bgBrightness 0→100 maps to L: dark themes 8→48, light themes 72→96
const THEMES = [
  { id: "macaron-pink",   label: "✦ 玫瑰",   h: 340, sDark: 22, sLight: 18, accent: "#e8a0b8", border: "340,60%" },
  { id: "macaron-purple", label: "✦ 薰衣草", h: 270, sDark: 20, sLight: 16, accent: "#b8a0e0", border: "270,55%" },
  { id: "macaron-blue",   label: "✦ 天空",   h: 210, sDark: 22, sLight: 18, accent: "#90c0e0", border: "210,60%" },
  { id: "macaron-mint",   label: "✦ 薄荷",   h: 155, sDark: 20, sLight: 16, accent: "#90d4b8", border: "155,55%" },
  { id: "macaron-peach",  label: "✦ 水蜜桃", h: 25,  sDark: 24, sLight: 20, accent: "#f0b890", border: "25,65%" },
  { id: "macaron-lemon",  label: "✦ 檸檬",   h: 50,  sDark: 22, sLight: 18, accent: "#e8d890", border: "50,60%" },
  { id: "warm-light",     label: "☀ 暖白",   h: 35,  sDark: 16, sLight: 14, accent: "#c49a6c", border: "35,50%", forceLight: true },
];

// ── STATE ─────────────────────────────────────────────────────
let state = loadState();
let editingBm = null;
let addTargetSection = null;

// ── LOAD / SAVE ───────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem("bella_startpage");
    if (raw) {
      const p = JSON.parse(raw);
      if (!p.settings.bgBrightness) p.settings.bgBrightness = 50;
      // migrate old theme names
      if (!THEMES.find(t => t.id === p.settings.theme)) p.settings.theme = "macaron-pink";
      return p;
    }
  } catch {}
  return deepClone(DEFAULT_DATA);
}
function saveState() { localStorage.setItem("bella_startpage", JSON.stringify(state)); }
function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

// ── THEME ENGINE ──────────────────────────────────────────────
// brightness 0–100:
//   0  = darkest  (L ~8% for dark feel)
//   50 = mid      (L ~26% dark / L ~84% light)
//   100= lightest (L ~48% still readable dark, or ~96% near white)
//
// Text colour flips automatically:
//   bg L < 55% → text is light (#f8f2fa)
//   bg L ≥ 55% → text is dark  (#2a2030)

function applyTheme(themeId, brightness) {
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  const root = document.documentElement;
  const h = theme.h;

  // forceLight themes: bgL goes 55%–96% (always light side)
  // normal themes:     bgL goes 8%–72%
  let bgL;
  if (theme.forceLight) {
    bgL = 55 + (brightness / 100) * 41; // 55 → 96
  } else {
    bgL = 8 + (brightness / 100) * 64;  // 8  → 72
  }

  const bg      = `hsl(${h},${theme.sDark}%,${bgL.toFixed(1)}%)`;
  const bg2     = `hsl(${h},${theme.sDark}%,${(bgL+4).toFixed(1)}%)`;
  const bg3     = `hsl(${h},${theme.sDark}%,${(bgL+8).toFixed(1)}%)`;
  const surface = `hsl(${h},${theme.sDark}%,${(bgL+12).toFixed(1)}%)`;

  // flip dark/light at bgL=50
  const isLight = bgL >= 50;

  // Text: always high contrast, low saturation
  const text      = isLight ? `hsl(${h},12%,8%)`  : `hsl(0,0%,97%)`;
  const textMuted = isLight ? `hsl(${h},10%,26%)`  : `hsl(0,0%,82%)`;
  const textDim   = isLight ? `hsl(${h},8%,40%)`   : `hsl(0,0%,58%)`;

  // Cards: always 8% lighter than bg so they're visible at every brightness
  // On light bg this means cards are noticeably whiter; on dark bg they're a lighter shade
  const cardOffset = isLight ? 8 : 4;
  const cardBg     = `hsl(${h},${theme.sDark}%,${Math.min(98, bgL + cardOffset).toFixed(1)}%)`;
  const cardBg3    = `hsl(${h},${theme.sDark}%,${Math.min(96, bgL + cardOffset * 2).toFixed(1)}%)`;
  const surfaceBg  = `hsl(${h},${theme.sDark}%,${Math.min(94, bgL + cardOffset * 3).toFixed(1)}%)`;

  // Borders: strong enough to separate card from bg at any brightness
  const borderOpacity  = isLight ? 0.22 : 0.14;
  const borderHOpacity = isLight ? 0.45 : 0.30;
  const borderColor    = isLight ? `${h},20%,8%` : `0,0%,100%`;
  const borderA = `hsla(${borderColor},${borderOpacity})`;
  const borderH = `hsla(${borderColor},${borderHOpacity})`;

  const shadow = isLight
    ? `0 2px 12px rgba(0,0,0,${(0.06 + (bgL - 50) * 0.001).toFixed(3)})`
    : `0 8px 40px rgba(0,0,0,0.50)`;

  // Accent: on light bg darken to 30% L so it's legible; on dark keep theme accent
  const accentColor = isLight ? `hsl(${h},38%,30%)` : theme.accent;

  root.style.setProperty("--bg",         bg);
  root.style.setProperty("--bg2",        cardBg);
  root.style.setProperty("--bg3",        cardBg3);
  root.style.setProperty("--surface",    surfaceBg);
  root.style.setProperty("--text",       text);
  root.style.setProperty("--text-muted", textMuted);
  root.style.setProperty("--text-dim",   textDim);
  root.style.setProperty("--border",     borderA);
  root.style.setProperty("--border-h",   borderH);
  root.style.setProperty("--accent",     accentColor);
  root.style.setProperty("--shadow",     shadow);
}

// ── CLOCK ─────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent =
    `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  const days = ["日","一","二","三","四","五","六"];
  document.getElementById("date-display").textContent =
    `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} 週${days[now.getDay()]}`;
}

// ── APPLY SETTINGS ────────────────────────────────────────────
function applySettings() {
  const { title, tagline, theme, showClock, bgBrightness } = state.settings;
  document.title = title;
  document.querySelector(".logo-name").textContent = title;
  document.getElementById("tagline-text").textContent = tagline;
  document.body.className = ""; // no CSS class needed — all via JS vars
  applyTheme(theme, bgBrightness ?? 50);
  const clockBlock = document.querySelector(".clock-block");
  if (clockBlock) clockBlock.style.display = showClock ? "" : "none";
}

// ── RENDER SECTIONS ───────────────────────────────────────────
function renderAll() {
  applySettings();
  const wrap = document.getElementById("sections-wrap");
  wrap.innerHTML = "";
  state.sections.forEach(sec => wrap.appendChild(buildSection(sec)));
}

function buildSection(sec) {
  const block = document.createElement("div");
  block.className = "section-block";
  block.dataset.secId = sec.id;
  block.innerHTML = `
    <div class="section-head">
      <span class="section-title">${esc(sec.title)}</span>
      <span class="section-count">${sec.bookmarks.length}</span>
      <button class="section-edit-btn" title="編輯分類">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>
    <div class="bookmark-grid"></div>
  `;
  block.querySelector('.section-edit-btn').addEventListener('click', () => openSectionModal(sec.id));
  const grid = block.querySelector(".bookmark-grid");
  sec.bookmarks.forEach((bm, i) => {
    const card = buildCard(bm, sec.id);
    card.style.animationDelay = `${i * 40}ms`;
    grid.appendChild(card);
  });
  const addCard = document.createElement("div");
  addCard.className = "bookmark-card card-add";
  addCard.innerHTML = `
    <div class="add-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
    <span class="add-label">新增書籤</span>`;
  addCard.addEventListener("click", () => openAddModal(sec.id));
  grid.appendChild(addCard);
  return block;
}

function buildCard(bm, secId) {
  const card = document.createElement("a");
  card.className = "bookmark-card";
  card.href = bm.url; card.target = "_blank"; card.rel = "noopener noreferrer";
  card.style.setProperty("--card-accent", bm.color || "var(--accent)");
  const domain = getDomain(bm.url);
  const faviconSrc = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(bm.url)}`;
  const letter = (bm.name || "?").charAt(0).toUpperCase();
  card.innerHTML = `
    <div class="card-favicon">
      <img src="${faviconSrc}" alt="" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
      <span class="favicon-letter" style="display:none">${esc(letter)}</span>
    </div>
    <div class="card-name">${esc(bm.name)}</div>
    ${bm.desc ? `<div class="card-desc">${esc(bm.desc)}</div>` : ""}
    <div class="card-domain">${esc(domain)}</div>
    <button class="card-edit-btn" title="編輯" aria-label="編輯書籤">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>`;
  card.querySelector(".card-edit-btn").addEventListener("click", e => {
    e.preventDefault(); e.stopPropagation();
    openEditModal(secId, bm.id);
  });
  return card;
}

// ── MODAL HELPERS ─────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add("open");
  document.getElementById(id).removeAttribute("aria-hidden");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
  document.getElementById(id).setAttribute("aria-hidden","true");
}

// ── BOOKMARK MODAL ────────────────────────────────────────────
function populateCategorySelect(selectedId) {
  const sel = document.getElementById("bm-category");
  sel.innerHTML = "";
  state.sections.forEach(sec => {
    const opt = document.createElement("option");
    opt.value = sec.id; opt.textContent = sec.title;
    if (sec.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function populateSwatches(selectedColor) {
  const wrap = document.getElementById("color-swatches");
  wrap.innerHTML = "";
  ACCENT_COLORS.forEach(c => {
    const s = document.createElement("div");
    s.className = "color-swatch" + (c === selectedColor ? " selected" : "");
    s.style.background = c; s.dataset.color = c;
    s.addEventListener("click", () => {
      wrap.querySelectorAll(".color-swatch").forEach(x => x.classList.remove("selected"));
      s.classList.add("selected");
    });
    wrap.appendChild(s);
  });
}

function getSelectedSwatch() {
  const s = document.querySelector(".color-swatch.selected");
  return s ? s.dataset.color : ACCENT_COLORS[0];
}

function openAddModal(secId) {
  addTargetSection = secId; editingBm = null;
  document.getElementById("modal-title").textContent = "新增書籤";
  ["bm-name","bm-url","bm-desc","bm-new-cat"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("btn-delete-bm").style.display = "none";
  populateCategorySelect(secId);
  populateSwatches(ACCENT_COLORS[0]);
  openModal("modal-bookmark");
  document.getElementById("bm-name").focus();
}

function openEditModal(secId, bmId) {
  const sec = state.sections.find(s => s.id === secId);
  const bm = sec?.bookmarks.find(b => b.id === bmId);
  if (!bm) return;
  editingBm = { secId, bmId }; addTargetSection = null;
  document.getElementById("modal-title").textContent = "編輯書籤";
  document.getElementById("bm-name").value = bm.name;
  document.getElementById("bm-url").value = bm.url;
  document.getElementById("bm-desc").value = bm.desc || "";
  document.getElementById("bm-new-cat").value = "";
  document.getElementById("btn-delete-bm").style.display = "";
  populateCategorySelect(secId);
  populateSwatches(bm.color || ACCENT_COLORS[0]);
  openModal("modal-bookmark");
}

function saveBm() {
  const name = document.getElementById("bm-name").value.trim();
  const url  = document.getElementById("bm-url").value.trim();
  const desc = document.getElementById("bm-desc").value.trim();
  const newCatName = document.getElementById("bm-new-cat").value.trim();
  const catId = document.getElementById("bm-category").value;
  const color = getSelectedSwatch();
  if (!name || !url) { alert("請填寫名稱與網址"); return; }
  let targetSecId = catId;
  if (newCatName) {
    const newId = "sec-" + Date.now();
    state.sections.push({ id: newId, title: newCatName, bookmarks: [] });
    targetSecId = newId;
  }
  if (editingBm) {
    const oldSec = state.sections.find(s => s.id === editingBm.secId);
    const idx = oldSec.bookmarks.findIndex(b => b.id === editingBm.bmId);
    const updated = { ...oldSec.bookmarks[idx], name, url, desc, color };
    if (targetSecId === editingBm.secId) { oldSec.bookmarks[idx] = updated; }
    else {
      oldSec.bookmarks.splice(idx, 1);
      const newSec = state.sections.find(s => s.id === targetSecId);
      if (newSec) newSec.bookmarks.push(updated);
    }
  } else {
    const sec = state.sections.find(s => s.id === targetSecId);
    if (sec) sec.bookmarks.push({ id: "bm-" + Date.now(), name, url, desc, color });
  }
  saveState(); renderAll(); closeModal("modal-bookmark");
}

function deleteBm() {
  if (!editingBm) return;
  if (!confirm("確定刪除這個書籤？")) return;
  const sec = state.sections.find(s => s.id === editingBm.secId);
  if (sec) sec.bookmarks = sec.bookmarks.filter(b => b.id !== editingBm.bmId);
  saveState(); renderAll(); closeModal("modal-bookmark");
}

// ── SETTINGS MODAL ────────────────────────────────────────────

// get currently active theme id from modal buttons
function getActiveThemeId() {
  const btn = document.querySelector(".theme-btn.active");
  return btn ? btn.dataset.themeId : state.settings.theme;
}

function openSettings() {
  document.getElementById("set-title").value = state.settings.title;
  document.getElementById("set-tagline").value = state.settings.tagline;
  document.getElementById("set-clock").checked = state.settings.showClock;

  const slider = document.getElementById("set-brightness");
  slider.value = state.settings.bgBrightness ?? 50;
  updateBrightnessLabel(slider.value);

  const wrap = document.getElementById("theme-options");
  wrap.innerHTML = "";
  THEMES.forEach(t => {
    const btn = document.createElement("button");
    btn.className = "theme-btn" + (state.settings.theme === t.id ? " active" : "");
    btn.textContent = t.label;
    btn.dataset.themeId = t.id;
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".theme-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      // instant preview with current slider value
      applyTheme(t.id, parseInt(slider.value));
    });
    wrap.appendChild(btn);
  });

  openModal("modal-settings");
}

function updateBrightnessLabel(val) {
  const el = document.getElementById("brightness-label");
  if (!el) return;
  const v = parseInt(val);
  el.textContent = v < 20 ? "極深" : v < 40 ? "深" : v < 60 ? "中" : v < 78 ? "淺" : "極淺";
}

function saveSettings() {
  state.settings.title        = document.getElementById("set-title").value.trim() || "Bella's Space";
  state.settings.tagline      = document.getElementById("set-tagline").value.trim();
  state.settings.theme        = getActiveThemeId();
  state.settings.showClock    = document.getElementById("set-clock").checked;
  state.settings.bgBrightness = parseInt(document.getElementById("set-brightness").value);
  saveState(); renderAll(); closeModal("modal-settings");
}

// ── SECTION MODAL ────────────────────────────────────────────
let editingSecId = null;

function openSectionModal(secId) {
  const sec = state.sections.find(s => s.id === secId);
  if (!sec) return;
  editingSecId = secId;
  document.getElementById("sec-name").value = sec.title;
  const delBtn = document.getElementById("btn-delete-sec");
  const canDel = state.sections.length > 1;
  delBtn.disabled = !canDel;
  delBtn.style.opacity = canDel ? "" : "0.4";
  openModal("modal-section");
  setTimeout(() => document.getElementById("sec-name").focus(), 50);
}

function saveSec() {
  const name = document.getElementById("sec-name").value.trim();
  if (!name) { alert("請輸入分類名稱"); return; }
  const sec = state.sections.find(s => s.id === editingSecId);
  if (sec) { sec.title = name; saveState(); renderAll(); closeModal("modal-section"); }
}

function deleteSec() {
  if (state.sections.length <= 1) return;
  const sec = state.sections.find(s => s.id === editingSecId);
  if (!sec) return;
  const bmCount = sec.bookmarks.length;
  const msg = bmCount > 0
    ? `「${sec.title}」內有20${bmCount}個書簽，刪除後將一併移除，確定嗎？`
    : `確定刪除「${sec.title}」分類？`;
  if (!confirm(msg)) return;
  state.sections = state.sections.filter(s => s.id !== editingSecId);
  saveState(); renderAll(); closeModal("modal-section");
}

// ── SEARCH ────────────────────────────────────────────────────
document.getElementById("search-input").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const q = e.target.value.trim();
    if (q) window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank");
  }
});

// ── UTILS ─────────────────────────────────────────────────────
function getDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}
function esc(str) {
  return String(str ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── EVENT BINDINGS ────────────────────────────────────────────
document.getElementById("btn-add").addEventListener("click", () => {
  openAddModal(state.sections[0]?.id ?? null);
});
document.getElementById("btn-settings").addEventListener("click", openSettings);
document.getElementById("modal-close").addEventListener("click", () => closeModal("modal-bookmark"));
document.getElementById("settings-close").addEventListener("click", () => {
  applySettings(); // revert preview
  closeModal("modal-settings");
});
document.getElementById("btn-save-bm").addEventListener("click", saveBm);
document.getElementById("btn-delete-bm").addEventListener("click", deleteBm);
document.getElementById("btn-save-settings").addEventListener("click", saveSettings);

// brightness slider → instant preview (works with whichever theme is active in modal)
document.getElementById("set-brightness").addEventListener("input", e => {
  applyTheme(getActiveThemeId(), parseInt(e.target.value));
  updateBrightnessLabel(e.target.value);
});

document.getElementById("section-modal-close").addEventListener("click", () => closeModal("modal-section"));
document.getElementById("btn-save-sec").addEventListener("click", saveSec);
document.getElementById("btn-delete-sec").addEventListener("click", deleteSec);

["modal-bookmark","modal-settings","modal-section"].forEach(id => {
  document.getElementById(id).addEventListener("click", e => {
    if (e.target === e.currentTarget) {
      if (id === "modal-settings") applySettings();
      closeModal(id);
    }
  });
});

// ── PWA INSTALL ───────────────────────────────────────────────
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); deferredPrompt = e;
  document.getElementById("install-banner").style.display = "flex";
});
document.getElementById("btn-install")?.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === "accepted") document.getElementById("install-banner").style.display = "none";
  deferredPrompt = null;
});
document.getElementById("btn-dismiss-banner")?.addEventListener("click", () => {
  document.getElementById("install-banner").style.display = "none";
});

// ── SERVICE WORKER ────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// ── INIT ──────────────────────────────────────────────────────
updateClock();
setInterval(updateClock, 10000);
renderAll();
