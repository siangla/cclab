// ── Tab switching ──────────────────────────────────────
function switchTab(tab) {
  const keys = ['numbers', 'strings', 'rps'];
  document.querySelectorAll('.tab').forEach((el, i) => {
    el.classList.toggle('active', keys[i] === tab);
  });
  document.querySelectorAll('.panel').forEach(el => el.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
}

// ── Helper: Fisher-Yates shuffle ──────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Helper: render result tags ────────────────────────
function renderTags(box, items) {
  box.style.display = 'flex';
  box.innerHTML = items.map(v => `<span class="result-tag">${v}</span>`).join('');
}

function renderError(box, msg) {
  box.style.display = 'flex';
  box.innerHTML = `<span style="color:#c62828;font-weight:500;">${msg}</span>`;
}

// ── 連續數字 ──────────────────────────────────────────
function generateNumbers() {
  const from  = parseInt(document.getElementById('numFrom').value);
  const to    = parseInt(document.getElementById('numTo').value);
  const count = parseInt(document.getElementById('numCount').value);
  const box   = document.getElementById('num-result');

  if (isNaN(from) || isNaN(to) || isNaN(count) || count < 1) {
    return renderError(box, '請填寫完整的範圍和數量');
  }
  if (from > to) return renderError(box, '「從」不能大於「到」');

  const range = [];
  for (let i = from; i <= to; i++) range.push(i);

  if (count > range.length) return renderError(box, '數量超過範圍內的數字個數');

  const picked = shuffle(range).slice(0, count).sort((a, b) => a - b);
  renderTags(box, picked);
}

// ── 貼上字串 ──────────────────────────────────────────
function generateStrings() {
  const raw   = document.getElementById('strInput').value;
  const count = parseInt(document.getElementById('strCount').value);
  const box   = document.getElementById('str-result');
  const items = raw.split('\n').map(s => s.trim()).filter(s => s.length > 0);

  if (items.length === 0)              return renderError(box, '請輸入至少一個字串');
  if (isNaN(count) || count < 1)       return renderError(box, '請輸入要選取的數量');
  if (count > items.length)            return renderError(box, '數量超過字串個數');

  renderTags(box, shuffle([...items]).slice(0, count));
}

// ── 剪刀石頭布 ────────────────────────────────────────
const RPS_EMOJI = { scissors: '✌️', rock: '✊', paper: '🖐️' };
const RPS_LABEL = { scissors: '剪刀', rock: '石頭', paper: '布' };
const RPS_BEATS = { scissors: 'paper', rock: 'scissors', paper: 'rock' }; // key beats value

function chooseRPS(choice) {
  document.querySelectorAll('.rps-btn').forEach(btn => btn.classList.remove('selected'));
  document.getElementById('rps-' + choice).classList.add('selected');

  const options = ['scissors', 'rock', 'paper'];
  const cpu = options[Math.floor(Math.random() * 3)];

  let outcome, outcomeClass, outcomeMsg;
  if (choice === cpu) {
    outcome = '平局！'; outcomeClass = 'draw'; outcomeMsg = '再來一局？';
  } else if (RPS_BEATS[choice] === cpu) {
    outcome = '🎉 你贏了！'; outcomeClass = 'win';
    outcomeMsg = `${RPS_LABEL[choice]} 贏了 ${RPS_LABEL[cpu]}`;
  } else {
    outcome = '😢 你輸了！'; outcomeClass = 'lose';
    outcomeMsg = `${RPS_LABEL[cpu]} 贏了 ${RPS_LABEL[choice]}`;
  }

  const bgMap  = { win: '#e8f5e9', lose: '#ffebee', draw: '#fff8e1' };
  const brdMap = { win: '#a5d6a7', lose: '#ef9a9a', draw: '#ffe082' };

  const area = document.getElementById('rps-result-area');
  area.className = 'rps-result show';
  area.style.background = bgMap[outcomeClass];
  area.style.border = `1.5px solid ${brdMap[outcomeClass]}`;
  area.innerHTML = `
    <div class="vs-row">
      <div>${RPS_EMOJI[choice]}</div>
      <div class="vs-text">VS</div>
      <div>${RPS_EMOJI[cpu]}</div>
    </div>
    <div class="rps-outcome ${outcomeClass}">${outcome}</div>
    <div class="rps-sub">${outcomeMsg}</div>
    <button class="rps-round-btn" onclick="resetRPS()">再來一局</button>
  `;
}

function resetRPS() {
  document.querySelectorAll('.rps-btn').forEach(btn => btn.classList.remove('selected'));
  const area = document.getElementById('rps-result-area');
  area.className = 'rps-result';
  area.innerHTML = '';
}
