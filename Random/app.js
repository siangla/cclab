/* ══════════════════════════════════════════
   SERVICE WORKER
══════════════════════════════════════════ */
if('serviceWorker' in navigator && location.protocol==='https:' && !location.hostname.includes('claudeusercontent')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('SW:',e)));
}

/* ══════════════════════════════════════════
   PWA INSTALL BANNER
══════════════════════════════════════════ */
let deferredPrompt=null;
const banner=document.getElementById('install-banner');
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;banner.style.display='flex';});
document.getElementById('btn-install').addEventListener('click',async()=>{
  banner.style.display='none';
  if(!deferredPrompt)return;
  deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;
});
document.getElementById('btn-dismiss').addEventListener('click',()=>banner.style.display='none');
window.addEventListener('appinstalled',()=>{banner.style.display='none';deferredPrompt=null;});

/* ══════════════════════════════════════════
   TABS
══════════════════════════════════════════ */
const ALL_TABS=['numbers','strings','rps','wheel','ladder'];
function switchTab(tab){
  document.querySelectorAll('.tab').forEach((el,i)=>el.classList.toggle('active',ALL_TABS[i]===tab));
  document.querySelectorAll('.panel').forEach(el=>el.classList.remove('active'));
  document.getElementById('panel-'+tab).classList.add('active');
  if(tab==='wheel') setTimeout(drawWheel,50);
}

document.querySelectorAll('input[type="number"]').forEach(el=>{
  el.addEventListener('keydown',e=>{
    if(e.key==='Enter'){const p=el.closest('.panel');p&&p.querySelector('.btn-gen')?.click();}
  });
});

/* ══════════════════════════════════════════
   SHARED HELPERS
══════════════════════════════════════════ */
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function pickWithRepeat(arr,n){
  const o=[];for(let i=0;i<n;i++)o.push(arr[Math.floor(Math.random()*arr.length)]);return o;
}
function showChips(box,items){
  box.innerHTML=items.map(v=>`<span class="result-chip">${v}</span>`).join('');
}
function showErr(box,wrap,msg){
  wrap.style.display='block';
  box.innerHTML=`<span class="result-chip err">${msg}</span>`;
  const copy=wrap.querySelector('.btn-copy');if(copy)copy.style.display='none';
}
function showResult(box,wrap,items){
  wrap.style.display='block';
  const copy=wrap.querySelector('.btn-copy');if(copy)copy.style.display='';
  showChips(box,items);
}

const hist={num:[],str:[]};
function addHistory(type,items){
  const now=new Date();
  const t=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  hist[type].unshift({t,items:[...items]});
  if(hist[type].length>5)hist[type].pop();
  renderHistory(type);
}
function renderHistory(type){
  const w=document.getElementById(type+'-history-wrap');
  const l=document.getElementById(type+'-history-list');
  if(!hist[type].length){w.style.display='none';return;}
  w.style.display='block';
  l.innerHTML=hist[type].map(h=>`
    <div class="history-row">
      <span class="history-time">${h.t}</span>
      <div class="history-chips">${h.items.map(v=>`<span class="h-chip">${v}</span>`).join('')}</div>
    </div>`).join('');
}

function copyResult(type){
  const box=document.getElementById(type+'-result');
  const chips=[...box.querySelectorAll('.result-chip:not(.err)')].map(c=>c.textContent);
  if(!chips.length)return;
  navigator.clipboard.writeText(chips.join(', ')).then(()=>{
    const btn=box.closest('.result-wrap').querySelector('.btn-copy');
    btn.textContent='已複製！';btn.classList.add('copied');
    setTimeout(()=>{btn.textContent='複製';btn.classList.remove('copied');},1800);
  });
}

function updateStrCounter(){
  const raw=document.getElementById('strInput').value;
  document.getElementById('str-count').textContent=raw.split('\n').map(s=>s.trim()).filter(s=>s).length;
}

function updateLadderCounter(){
  const raw=document.getElementById('ladderPrizes').value;
  document.getElementById('ladder-prize-count').textContent=raw.split('\n').map(s=>s.trim()).filter(s=>s).length;
}

/* ══════════════════════════════════════════
   連續數字
══════════════════════════════════════════ */
function generateNumbers(){
  const from=parseInt(document.getElementById('numFrom').value);
  const to=parseInt(document.getElementById('numTo').value);
  const count=parseInt(document.getElementById('numCount').value);
  const repeat=document.getElementById('numRepeat').checked;
  const box=document.getElementById('num-result');
  const wrap=document.getElementById('num-result-wrap');
  if(isNaN(from)||isNaN(to)||isNaN(count)||count<1)return showErr(box,wrap,'請填寫完整的範圍和數量');
  if(from>to)return showErr(box,wrap,'「從」不能大於「到」');
  const range=[];for(let i=from;i<=to;i++)range.push(i);
  if(!repeat&&count>range.length)return showErr(box,wrap,'數量超過範圍，請開啟「允許重複」');
  const picked=repeat?pickWithRepeat(range,count).sort((a,b)=>a-b):shuffle(range).slice(0,count).sort((a,b)=>a-b);
  showResult(box,wrap,picked);addHistory('num',picked);
}

/* ══════════════════════════════════════════
   貼上字串
══════════════════════════════════════════ */
function generateStrings(){
  const raw=document.getElementById('strInput').value;
  const count=parseInt(document.getElementById('strCount').value);
  const box=document.getElementById('str-result');
  const wrap=document.getElementById('str-result-wrap');
  const items=raw.split('\n').map(s=>s.trim()).filter(s=>s);
  if(!items.length)return showErr(box,wrap,'請輸入至少一個字串');
  if(isNaN(count)||count<1)return showErr(box,wrap,'請輸入要選取的數量');
  if(count>items.length)return showErr(box,wrap,'數量超過字串個數');
  const picked=shuffle(items).slice(0,count);
  showResult(box,wrap,picked);addHistory('str',picked);
}

/* ══════════════════════════════════════════
   剪刀石頭布
══════════════════════════════════════════ */
const EMOJI={scissors:'✌️',rock:'✊',paper:'🖐️'};
const LABEL={scissors:'剪刀',rock:'石頭',paper:'布'};
const BEATS={scissors:'paper',rock:'scissors',paper:'rock'};
let rpsScore={win:0,draw:0,lose:0};

function chooseRPS(choice){
  document.querySelectorAll('.rps-btn').forEach(b=>b.classList.remove('selected'));
  document.getElementById('rps-'+choice).classList.add('selected');
  const cpu=['scissors','rock','paper'][Math.floor(Math.random()*3)];
  let v,cls,note;
  if(choice===cpu){v='平局！';cls='draw';note='旗鼓相當，再來一局？';}
  else if(BEATS[choice]===cpu){v='🎉 你贏了！';cls='win';note=`${LABEL[choice]} 打敗了 ${LABEL[cpu]}`;}
  else{v='😢 你輸了！';cls='lose';note=`${LABEL[cpu]} 打敗了 ${LABEL[choice]}`;}
  rpsScore[cls]++;
  document.getElementById('score-win').textContent=rpsScore.win;
  document.getElementById('score-draw').textContent=rpsScore.draw;
  document.getElementById('score-lose').textContent=rpsScore.lose;
  const bg={win:'#edf7e4',lose:'#fdecea',draw:'#fef9e4'};
  const area=document.getElementById('rps-result-area');
  area.className='rps-result show';area.style.background=bg[cls];
  area.innerHTML=`
    <div class="rps-battle">
      <span class="emoji">${EMOJI[choice]}</span><span class="vs">VS</span><span class="emoji">${EMOJI[cpu]}</span>
    </div>
    <div class="rps-verdict ${cls}">${v}</div>
    <div class="rps-note">${note}</div>
    <button class="btn-retry" onclick="resetRPS()">↺ 再來一局</button>`;
}
function resetRPS(){
  document.querySelectorAll('.rps-btn').forEach(b=>b.classList.remove('selected'));
  const a=document.getElementById('rps-result-area');a.className='rps-result';a.innerHTML='';
}

/* ══════════════════════════════════════════
   轉盤 WHEEL
══════════════════════════════════════════ */
const WHEEL_COLORS=['#a8c17c','#f2a97e','#85b8d4','#e8d26a','#c5a3d4','#f0b97e','#7ec4b8','#d4a8a8'];
let wheelSpinning=false,wheelAngle=0;

function getWheelItems(){
  return (document.getElementById('wheelInput').value||'').split('\n').map(s=>s.trim()).filter(s=>s);
}

function drawWheel(highlightIdx=-1){
  const canvas=document.getElementById('wheelCanvas');
  const size=canvas.width;
  const ctx=canvas.getContext('2d');
  const items=getWheelItems();
  ctx.clearRect(0,0,size,size);
  if(!items.length){
    ctx.fillStyle='#e4edda';ctx.beginPath();ctx.arc(size/2,size/2,size/2-1,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#b8aea0';ctx.font=`bold ${size*0.05}px Noto Sans TC,sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('請輸入選項',size/2,size/2);
    return;
  }
  const n=items.length,slice=(Math.PI*2)/n,r=size/2;
  for(let i=0;i<n;i++){
    const start=wheelAngle+i*slice,end=start+slice;
    ctx.beginPath();ctx.moveTo(r,r);ctx.arc(r,r,r-1,start,end);ctx.closePath();
    ctx.fillStyle=highlightIdx===i?'#fff3b0':WHEEL_COLORS[i%WHEEL_COLORS.length];ctx.fill();
    ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
    ctx.save();ctx.translate(r,r);ctx.rotate(start+slice/2);
    const maxLen=r*0.52,txt=items[i];
    const fs=n>8?Math.floor(size*0.038):Math.floor(size*0.045);
    ctx.font=`bold ${fs}px Noto Sans TC,sans-serif`;
    ctx.fillStyle=highlightIdx===i?'#5a4a00':'#fff';
    ctx.textAlign='right';ctx.textBaseline='middle';
    let display=txt;
    while(ctx.measureText(display).width>maxLen&&display.length>1)display=display.slice(0,-1);
    if(display!==txt)display=display.slice(0,-1)+'…';
    ctx.fillText(display,r-r*0.06,0);
    ctx.restore();
  }
}

function getWheelWinner(){
  const items=getWheelItems();if(!items.length)return -1;
  const n=items.length,slice=(Math.PI*2)/n;
  let a=((-wheelAngle-Math.PI/2)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
  return Math.floor(a/slice)%n;
}

function spinWheel(){
  const items=getWheelItems();
  if(!items.length||wheelSpinning)return;
  wheelSpinning=true;
  document.getElementById('wheelBtn').disabled=true;
  document.getElementById('wheel-result-box').innerHTML='';
  const totalRot=(Math.PI*2)*(5+Math.floor(Math.random()*5))+(Math.random()*Math.PI*2);
  const duration=3500+Math.random()*1200;
  const startAngle=wheelAngle,startTime=performance.now();
  function ease(t){return 1-Math.pow(1-t,4);}
  function frame(now){
    const elapsed=now-startTime,progress=Math.min(elapsed/duration,1);
    wheelAngle=startAngle+totalRot*ease(progress);
    drawWheel();
    if(progress<1){requestAnimationFrame(frame);}
    else{
      wheelSpinning=false;
      document.getElementById('wheelBtn').disabled=false;
      const idx=getWheelWinner();
      drawWheel(idx);
      document.getElementById('wheel-result-box').innerHTML=`<span class="wheel-winner">🎉 ${items[idx]}</span>`;
    }
  }
  requestAnimationFrame(frame);
}
window.addEventListener('load',()=>setTimeout(drawWheel,100));

/* ══════════════════════════════════════════
   爬樓梯 LADDER
══════════════════════════════════════════ */
const P_COLORS=['#a8c17c','#f2a97e','#85b8d4','#e8d26a','#c5a3d4','#f0b97e','#7ec4b8','#d4a8a8'];
let ladderState=null;
let ladderAnimating=false;

// ── Build ladder data ──
function buildLadder(){
  const items=document.getElementById('ladderPrizes').value.split('\n').map(s=>s.trim()).filter(s=>s);
  if(items.length<2){showLadderErr('請輸入至少 2 個選項');return null;}
  if(items.length>10){showLadderErr('最多支援 10 個選項');return null;}

  const N=items.length;
  const ROWS=Math.max(10,N*3);

  // Build bars
  const bars=[];
  for(let r=0;r<ROWS;r++){
    bars.push(new Array(N-1).fill(false));
    for(let c=0;c<N-1;c++){
      if(c>0&&bars[r][c-1])continue;
      bars[r][c]=Math.random()<0.42;
    }
  }

  // Pre-compute full path for each starting column
  const paths=[];
  for(let start=0;start<N;start++){
    let col=start;
    const path=[[col,0]];
    for(let r=0;r<ROWS;r++){
      if(col<N-1&&bars[r][col]) col++;
      else if(col>0&&bars[r][col-1]) col--;
      path.push([col,r+1]);
    }
    paths.push(path);
  }

  // Shuffle items so result is random
  const shuffledItems=shuffle(items);

  return{items:shuffledItems,bars,N,ROWS,paths,revealed:new Array(N).fill(false)};
}

// ── Canvas layout helpers ──
function getLadderLayout(N,ROWS,canvasW){
  const PAD_H=16;
  const PAD_V_TOP=52;
  const PAD_V_BOT=48;
  const COL_W=Math.max(40,Math.floor((canvasW-PAD_H*2)/N));
  const W=COL_W*N+PAD_H*2;
  const ROW_H=Math.max(16,Math.min(24,Math.floor(260/ROWS)));
  const H=PAD_V_TOP+ROWS*ROW_H+PAD_V_BOT;
  const colX=i=>PAD_H+i*COL_W+COL_W/2;
  const rowY=r=>PAD_V_TOP+r*ROW_H;
  return{COL_W,W,ROW_H,H,colX,rowY,PAD_H,PAD_V_TOP,PAD_V_BOT};
}

// ── Draw everything onto canvas ──
function drawLadder(canvas,state,animCol,animProg){
  const{items,bars,N,ROWS,paths,revealed}=state;
  const L=getLadderLayout(N,ROWS,canvas.width);
  const{colX,rowY,COL_W,ROW_H,H,W}=L;
  const ctx=canvas.getContext('2d');

  // Resize if needed
  if(canvas.height!==H){canvas.height=H;}

  ctx.clearRect(0,0,canvas.width,H);

  // ── Vertical lines ──
  for(let c=0;c<N;c++){
    ctx.save();
    ctx.strokeStyle=P_COLORS[c%P_COLORS.length];
    ctx.lineWidth=3;ctx.lineCap='round';
    ctx.globalAlpha=0.3;
    ctx.beginPath();ctx.moveTo(colX(c),rowY(0));ctx.lineTo(colX(c),rowY(ROWS));ctx.stroke();
    ctx.restore();
  }

  // ── Horizontal bars ──
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<N-1;c++){
      if(!bars[r][c])continue;
      ctx.save();
      ctx.strokeStyle='#8a7f72';ctx.lineWidth=2.5;ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(colX(c),rowY(r)+ROW_H/2);
      ctx.lineTo(colX(c+1),rowY(r)+ROW_H/2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Top labels (line numbers) ──
  const topFs=Math.max(10,Math.min(14,COL_W*0.28));
  ctx.textAlign='center';
  for(let c=0;c<N;c++){
    ctx.save();
    ctx.font=`900 ${topFs}px Nunito,sans-serif`;
    ctx.fillStyle=P_COLORS[c%P_COLORS.length];
    ctx.textBaseline='bottom';
    ctx.fillText(`${c+1}`,colX(c),rowY(0)-4);
    ctx.font=`bold ${topFs*0.85}px Noto Sans TC,sans-serif`;
    ctx.fillStyle=P_COLORS[c%P_COLORS.length];
    ctx.globalAlpha=0.7;
    ctx.fillText('↓',colX(c),rowY(0)-4-topFs);
    ctx.restore();
  }

  // ── Bottom labels ──
  const botFs=Math.max(9,Math.min(12,COL_W*0.22));
  for(let c=0;c<N;c++){
    const isRevealed=revealed[c];
    // column c at bottom always shows items[c] (the prize assigned to that bottom slot)
    ctx.save();
    ctx.font=`800 ${botFs}px Nunito,sans-serif`;
    ctx.textBaseline='top';
    ctx.textAlign='center';
    ctx.fillStyle=isRevealed?P_COLORS[c%P_COLORS.length]:'#c0b8b0';
    let label=isRevealed?items[c]:'?';
    while(ctx.measureText(label).width>COL_W-6&&label.length>1) label=label.slice(0,-1);
    ctx.fillText(label,colX(c),rowY(ROWS)+6);
    ctx.restore();
  }

  // ── Animated path ──
  if(animCol>=0 && animProg>=0){
    const path=paths[animCol];
    const totalSteps=path.length-1;
    const drawUpTo=animProg>=1?totalSteps:animProg*totalSteps;

    ctx.save();
    ctx.strokeStyle=P_COLORS[animCol%P_COLORS.length];
    ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.shadowColor=P_COLORS[animCol%P_COLORS.length];
    ctx.shadowBlur=10;

    ctx.beginPath();
    ctx.moveTo(colX(path[0][0]),rowY(path[0][1]));

    for(let s=1;s<=totalSteps;s++){
      const prog=Math.min(Math.max(drawUpTo-(s-1),0),1);
      if(prog<=0)break;

      const[prevC,prevR]=path[s-1];
      const[curC,curR]=path[s];
      const midY=rowY(prevR)+ROW_H/2;

      if(curC!==prevC){
        // Horizontal crossing: go down to midpoint, then across, then down
        const x0=colX(prevC),x1=colX(curC);
        const y0=rowY(prevR),y1=rowY(curR);
        // Split into 3 sub-segments: down-half, across, down-half
        const seg=1/3;
        if(prog<=seg){
          const t=prog/seg;
          ctx.lineTo(x0,y0+(midY-y0)*t);
        } else if(prog<=2*seg){
          const t=(prog-seg)/seg;
          ctx.lineTo(x0,midY);
          ctx.lineTo(x0+(x1-x0)*t,midY);
        } else {
          const t=(prog-2*seg)/seg;
          ctx.lineTo(x0,midY);ctx.lineTo(x1,midY);
          ctx.lineTo(x1,midY+(y1-midY)*t);
        }
      } else {
        const x=colX(curC);
        const y0=rowY(prevR),y1=rowY(curR);
        ctx.lineTo(x,y0+(y1-y0)*prog);
      }
    }
    ctx.stroke();
    ctx.restore();

    // Moving dot
    const dotStep=Math.floor(drawUpTo);
    const dotFrac=drawUpTo-dotStep;
    const safeStep=Math.min(dotStep,totalSteps-1);
    const[pc,pr]=path[safeStep];
    const[nc,nr]=path[Math.min(safeStep+1,totalSteps)];
    let dx=colX(pc),dy=rowY(pr);
    if(safeStep<totalSteps){
      dx=colX(pc)+(colX(nc)-colX(pc))*dotFrac;
      dy=rowY(pr)+(rowY(nr)-rowY(pr))*dotFrac;
    }
    ctx.save();
    ctx.fillStyle=P_COLORS[animCol%P_COLORS.length];
    ctx.shadowColor=P_COLORS[animCol%P_COLORS.length];ctx.shadowBlur=10;
    ctx.beginPath();ctx.arc(dx,dy,6,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(dx,dy,3,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
}

// ── Generate ──
function generateLadder(){
  const state=buildLadder();
  if(!state)return;
  ladderState=state;
  ladderAnimating=false;

  const wrap=document.getElementById('ladder-canvas-wrap');
  wrap.style.display='block';

  const canvas=document.getElementById('ladderCanvas');
  // Use panel width as reference
  const panelW=canvas.closest('.panel').clientWidth||300;
  const canvasW=Math.min(panelW-8, 460);
  canvas.width=canvasW;

  const L=getLadderLayout(state.N,state.ROWS,canvasW);
  canvas.height=L.H;

  drawLadder(canvas,state,-1,0);

  // Build pick buttons
  const pickRow=document.getElementById('ladder-pick-row');
  pickRow.innerHTML='';
  for(let c=0;c<state.N;c++){
    const btn=document.createElement('button');
    btn.className='ladder-pick-btn';
    btn.textContent=`第 ${c+1} 條`;
    btn.onclick=()=>pickLadderLine(c);
    pickRow.appendChild(btn);
  }

  document.getElementById('ladder-result-reveal').style.display='none';
  document.getElementById('ladder-result-reveal').innerHTML='';
}

// ── Pick & animate ──
function pickLadderLine(col){
  if(!ladderState||ladderAnimating)return;
  ladderAnimating=true;

  const state=ladderState;
  const canvas=document.getElementById('ladderCanvas');

  // Mark button chosen
  document.querySelectorAll('.ladder-pick-btn').forEach(b=>b.disabled=true);
  document.querySelectorAll('.ladder-pick-btn')[col].classList.add('chosen');

  const duration=900+state.ROWS*30;
  const startTime=performance.now();

  function frame(now){
    const elapsed=now-startTime;
    const progress=Math.min(elapsed/duration,1);
    // ease in-out
    const eased=progress<0.5?2*progress*progress:1-Math.pow(-2*progress+2,2)/2;
    drawLadder(canvas,state,col,eased);

    if(progress<1){
      requestAnimationFrame(frame);
    } else {
      ladderAnimating=false;
      // path[col] ends at endCol -> reveal that bottom slot
      const endCol=state.paths[col][state.paths[col].length-1][0];
      state.revealed[endCol]=true;
      drawLadder(canvas,state,col,1);

      const prize=state.items[endCol];
      const rev=document.getElementById('ladder-result-reveal');
      rev.style.display='block';
      rev.innerHTML=`
        <div class="ladder-reveal-chip">🎉 ${prize}</div>
        <button class="ladder-reset-btn" onclick="resetLadder()">↺ 重新抽籤</button>`;

      document.querySelectorAll('.ladder-pick-btn').forEach((b,i)=>{
        if(i!==col)b.disabled=false;
      });
    }
  }
  requestAnimationFrame(frame);
}

function resetLadder(){
  ladderState=null;
  ladderAnimating=false;
  document.getElementById('ladder-canvas-wrap').style.display='none';
  document.getElementById('ladder-result-reveal').style.display='none';
  document.getElementById('ladder-pick-row').innerHTML='';
}

function showLadderErr(msg){
  document.getElementById('ladder-result-reveal').style.display='block';
  document.getElementById('ladder-result-reveal').innerHTML=`<span class="result-chip err" style="animation:none;">${msg}</span>`;
  document.getElementById('ladder-canvas-wrap').style.display='none';
  document.getElementById('ladder-pick-row').innerHTML='';
}

/* ══════════════════════════════════════════
   分攤帳單 SPLIT BILL v2
══════════════════════════════════════════ */

// Override switchTab to handle split init
const _origSwitchTab=switchTab;
function switchTab(tab){
  document.querySelectorAll('.tab').forEach((el,i)=>{
    el.classList.toggle('active',['numbers','strings','rps','wheel','ladder','split'][i]===tab);
  });
  document.querySelectorAll('.panel').forEach(el=>el.classList.remove('active'));
  document.getElementById('panel-'+tab).classList.add('active');
  if(tab==='wheel') setTimeout(drawWheel,50);
}

// ── Helpers ──
function getSplitTotal(){return parseFloat(document.getElementById('splitTotal').value)||0;}
function getSplitPeople(){return Math.max(1,parseInt(document.getElementById('splitPeople').value)||0);}

function splitErr(msg){
  const r=document.getElementById('split-result');
  r.style.display='block';
  r.innerHTML=`<div style="padding:12px 0;"><span class="result-chip err" style="animation:none;display:inline-block;">${msg}</span></div>`;
}

// ── 1. 平均分配 ──
function doEvenSplit(){
  setActiveMode(0);
  document.getElementById('split-item-area').style.display='none';
  const total=getSplitTotal();
  const n=getSplitPeople();
  if(!total||!n){splitErr('請填入總金額與人數');return;}

  const each=total/n;
  const eachRounded=Math.ceil(each);
  const r=document.getElementById('split-result');
  r.style.display='block';
  r.innerHTML=`
    <div class="split-summary-box">
      <div class="ssum-row"><span class="ssum-label">總金額</span><span class="ssum-val">NT$ ${total.toLocaleString()}</span></div>
      <div class="ssum-row"><span class="ssum-label">參與人數</span><span class="ssum-val">${n} 人</span></div>
      <div class="ssum-total-row">
        <span class="ssum-total-label">每人應付</span>
        <span class="ssum-total-val">NT$ ${eachRounded.toLocaleString()}</span>
      </div>
    </div>
    <div style="font-size:.78rem;color:var(--ink-light);text-align:center;">
      ${total%n!==0?`（無條件進位，實收 NT$ ${(eachRounded*n).toLocaleString()}，多收 NT$ ${eachRounded*n-total}）`:'（整除，無零頭）'}
    </div>`;
}

// ── 2. 各自點餐 ──
let splitPersonCount=0,splitItemCount=0;

function doItemSplit(){
  setActiveMode(1);
  const total=getSplitTotal();
  const n=getSplitPeople();
  if(!total||!n){splitErr('請填入總金額與人數');return;}

  document.getElementById('split-result').style.display='none';
  const area=document.getElementById('split-item-area');
  area.style.display='block';

  // Rebuild person list
  splitPersonCount=0;splitItemCount=0;
  const list=document.getElementById('person-list');
  list.innerHTML='';
  for(let i=0;i<n;i++) addSplitPerson(`成員 ${i+1}`);
}

function addSplitPerson(name=''){
  splitPersonCount++;
  const pid=`sp-${splitPersonCount}`;
  const div=document.createElement('div');
  div.className='person-card';div.id=pid;
  div.innerHTML=`
    <div class="person-header">
      <input class="person-name-input" type="text" placeholder="成員名稱" value="${name}">
      <button class="btn-remove-person" onclick="document.getElementById('${pid}').remove()" title="移除">×</button>
    </div>
    <div class="item-list" id="il-${pid}"></div>
    <button class="btn-add-item" onclick="addSplitItem('${pid}')">＋ 新增餐點</button>`;
  document.getElementById('person-list').appendChild(div);
  addSplitItem(pid);
}

function addSplitItem(pid){
  splitItemCount++;
  const iid=`si-${splitItemCount}`;
  const row=document.createElement('div');
  row.className='item-row';row.id=iid;
  row.innerHTML=`
    <input class="item-name-input" type="text" placeholder="餐點（選填）">
    <input class="item-price-input" type="number" placeholder="金額" min="0" inputmode="decimal">
    <button class="btn-remove-item" onclick="document.getElementById('${iid}').remove()" title="刪除">×</button>`;
  document.getElementById(`il-${pid}`).appendChild(row);
}

function toggleService(){
  document.getElementById('servicePct').disabled=!document.getElementById('serviceToggle').checked;
}

function calcItemSplit(){
  const total=getSplitTotal();
  if(!total){splitErr('請填入總金額');return;}

  const serviceOn=document.getElementById('serviceToggle').checked;
  const svcPct=(parseFloat(document.getElementById('servicePct').value)||10)/100;

  // foodTotal = total before service fee (if service included in total)
  // total = foodTotal * (1 + svcPct) => foodTotal = total / (1+svcPct)
  const foodTotal=serviceOn ? total/(1+svcPct) : total;
  const serviceTotal=total-foodTotal;

  // Collect person data
  const cards=[...document.getElementById('person-list').children];
  if(!cards.length){splitErr('請新增成員');return;}

  const people=[];
  let sumOrdered=0;
  for(const card of cards){
    const name=card.querySelector('.person-name-input').value.trim()||'未命名';
    const rows=[...card.querySelectorAll('.item-row')];
    const items=[];
    for(const row of rows){
      const iname=row.querySelector('.item-name-input').value.trim();
      const price=parseFloat(row.querySelector('.item-price-input').value);
      if(!isNaN(price)&&price>0) items.push({name:iname||'餐點',price});
    }
    const ordered=items.reduce((s,i)=>s+i.price,0);
    sumOrdered+=ordered;
    people.push({name,items,ordered});
  }

  // Shared amount = foodTotal - sumOrdered  (split evenly)
  const shared=Math.max(0,foodTotal-sumOrdered);
  const sharedPerPerson=people.length>0?shared/people.length:0;

  // Each person: ordered + sharedPerPerson + proportional service fee
  const results=people.map(p=>{
    const base=p.ordered+sharedPerPerson;
    const svc=serviceOn&&foodTotal>0 ? base/foodTotal*serviceTotal : 0;
    const total_pay=base+svc;
    return{...p, sharedPerPerson, svc, total_pay};
  });

  // Render
  const r=document.getElementById('split-result');
  r.style.display='block';
  r.innerHTML=`
    <div class="split-summary-box">
      <div class="ssum-row"><span class="ssum-label">帳單總金額</span><span class="ssum-val">NT$ ${total.toLocaleString()}</span></div>
      ${serviceOn?`<div class="ssum-row"><span class="ssum-label">內含服務費 (${(svcPct*100).toFixed(0)}%)</span><span class="ssum-val">NT$ ${serviceTotal.toFixed(0)}</span></div>`:''}
      <div class="ssum-row"><span class="ssum-label">各自點餐合計</span><span class="ssum-val">NT$ ${sumOrdered.toFixed(0)}</span></div>
      <div class="ssum-row"><span class="ssum-label">公共分攤金額</span><span class="ssum-val">NT$ ${shared.toFixed(0)}</span></div>
      <div class="ssum-total-row"><span class="ssum-total-label">人均公攤</span><span class="ssum-total-val">NT$ ${Math.ceil(sharedPerPerson).toLocaleString()}</span></div>
    </div>
    <div class="split-result-title">各人應付明細</div>
    <div class="person-result-list">
      ${results.map(p=>`
        <div class="prc">
          <div class="prc-header">
            <span class="prc-name">${p.name}</span>
            <span class="prc-total">NT$ ${Math.ceil(p.total_pay).toLocaleString()}</span>
          </div>
          <div class="prc-breakdown">
            ${p.items.map(i=>`<div style="display:flex;justify-content:space-between;"><span>${i.name}</span><span style="font-family:Nunito;font-weight:700;">NT$ ${i.price.toFixed(0)}</span></div>`).join('')}
            ${p.sharedPerPerson>0?`<div style="display:flex;justify-content:space-between;"><span>公攤</span><span style="font-family:Nunito;font-weight:700;">NT$ ${p.sharedPerPerson.toFixed(1)}</span></div>`:''}
            ${p.svc>0?`<div style="display:flex;justify-content:space-between;color:var(--ink-light);"><span>服務費</span><span style="font-family:Nunito;font-weight:700;">NT$ ${p.svc.toFixed(1)}</span></div>`:''}
          </div>
        </div>`).join('')}
    </div>`;
}

// ── 3. 隨機分紅包 ──
let _hbTotal=0,_hbN=0;

function doHongbao(){
  setActiveMode(2);
  document.getElementById('split-item-area').style.display='none';
  const total=getSplitTotal();
  const n=getSplitPeople();
  if(!total||!n){splitErr('請填入總金額與人數');return;}
  _hbTotal=Math.round(total);_hbN=n;
  renderHongbao();
}

function renderHongbao(){
  const amounts=randomSplit(_hbTotal,_hbN);
  // no sorting - keep random order for fun

  const r=document.getElementById('split-result');
  r.style.display='block';
  r.innerHTML=`
    <div class="split-summary-box">
      <div class="ssum-row"><span class="ssum-label">總金額</span><span class="ssum-val">NT$ ${_hbTotal.toLocaleString()}</span></div>
      <div class="ssum-row"><span class="ssum-label">人數</span><span class="ssum-val">${_hbN} 份</span></div>
    </div>
    <div class="split-result-title">🧧 隨機分配結果</div>
    <div class="hongbao-list">
      ${amounts.map((amt,i)=>`
        <div class="hb-card">
          <div class="hb-rank ${i===0?'top1':i===1?'top2':i===2?'top3':''}">${i+1}</div>
          <span class="hb-name">第 ${i+1} 份</span>
          <span class="hb-amount">NT$ ${amt.toLocaleString()}</span>
        </div>`).join('')}
    </div>
    <div class="hb-note">總計 NT$ ${amounts.reduce((a,b)=>a+b,0).toLocaleString()}</div>
    <button class="btn-reroll" onclick="renderHongbao()">🎲 再抽一次</button>`;
}

function setActiveMode(idx){
  document.querySelectorAll('.split-func-btn').forEach((b,i)=>b.classList.toggle('active-mode',i===idx));
}

// Random split n parts summing to total, each at least 1, variance controlled
function randomSplit(total,n){
  if(n<=1)return[total];
  if(total<n)return new Array(n).fill(0).map((_,i)=>i<total?1:0);

  // Base = floor(total/n), remainder distributed randomly
  const base=Math.floor(total/n);
  const remainder=total-base*n;

  // Give each person base, then add 0 or 1 for remainder slots
  const parts=new Array(n).fill(base);
  const bonusSlots=shuffle([...Array(n).keys()]).slice(0,remainder);
  bonusSlots.forEach(i=>parts[i]++);

  // Add small random noise: each person swaps ±variance with a random neighbour
  // variance = up to 15% of average, so spread stays reasonable
  const maxSwap=Math.max(1,Math.floor(base*0.15));
  for(let i=0;i<n*2;i++){
    const a=Math.floor(Math.random()*n);
    const b=Math.floor(Math.random()*n);
    if(a===b)continue;
    const swap=Math.floor(Math.random()*maxSwap)+1;
    if(parts[a]-swap>=1&&parts[b]+swap>=1){
      parts[a]-=swap;parts[b]+=swap;
    }
  }
  return parts;
}
