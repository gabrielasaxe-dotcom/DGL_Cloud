const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(value||0));
const ACTION_PIN = '2324';
let adminKey = localStorage.getItem('dglAdminKey') || '';
let selectedMachineId = localStorage.getItem('dglMachineId') || '';
let collectionMachineId = localStorage.getItem('dglCollectionMachineId') || '';
let fleet = [];

function toast(message){const el=$('toast');if(!el)return;el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2400)}
function text(id,value){const el=$(id);if(el)el.textContent=value}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
async function api(url,options={}){const headers={'Content-Type':'application/json',...(options.headers||{})};if(adminKey)headers['x-admin-key']=adminKey;const r=await fetch(url,{...options,headers});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
function kindOf(m){const s=`${m?.id||''} ${m?.name||''}`.toLowerCase();if(s.includes('peluch'))return'Peluchera';if(s.includes('pinball'))return'Pinball';if(s.includes('isla'))return'Isla';if(s.includes('cascada'))return'Cascada';return'MÃ¡quina'}
function isCascade(m){return kindOf(m)==='Cascada'||/dgl-0[12]\b/i.test(m?.id||'')}
function valueAny(t,keys){for(const k of keys){if(t[k]!==undefined&&t[k]!==null)return t[k]}return null}

function renderFleet(){
  const grid=$('machineGrid');
  const online=fleet.filter(m=>m.online).length;
  const today=fleet.reduce((a,m)=>a+Number(m.telemetry?.totalToday||0),0);
  const current=fleet.reduce((a,m)=>a+Number(m.collection?.current||0),0);
  text('fleetTotal',fleet.length);text('fleetOnline',online);text('fleetToday',money(today));text('fleetCurrent',money(current));
  if(!fleet.length){grid.innerHTML='<div class="empty-card">TodavÃ­a no hay mÃ¡quinas reportando al servidor.</div>';return}
  grid.innerHTML=fleet.map(m=>{const t=m.telemetry||{},kind=kindOf(m);return `<article class="machine-card" data-machine="${escapeHtml(m.id)}"><div class="machine-card-head"><div><p class="section-kicker">${escapeHtml(kind.toUpperCase())} Â· ${escapeHtml(m.id)}</p><h3>${escapeHtml(m.name||m.id)}</h3><div class="loc">${escapeHtml(m.location||'UbicaciÃ³n sin definir')}</div></div><span class="machine-status ${m.online?'online':''}"></span></div><div class="machine-card-metrics"><div><span>Hoy</span><b>${money(t.totalToday)}</b></div><div><span>Por recaudar</span><b>${money(m.collection?.current)}</b></div><div><span>Estado</span><b>${m.online?'ONLINE':'OFFLINE'}</b></div><div><span>WiFi</span><b>${t.wifiRssi??'â'} dBm</b></div></div><div class="machine-card-foot"><span>${m.collection?.count||0} recaudaciones</span><span>Abrir â</span></div></article>`}).join('');
  grid.querySelectorAll('[data-machine]').forEach(card=>card.onclick=()=>openMachine(card.dataset.machine));
  fillCollectionMachineSelector();
}

async function loadFleet(){const data=await api('/api/machines');fleet=data.machines||[];$('serverPill')?.classList.add('ok');if($('serverPill')?.querySelector('span'))$('serverPill').querySelector('span').textContent='Servidor online';renderFleet()}
async function openMachine(id){selectedMachineId=id;localStorage.setItem('dglMachineId',id);$('detailShell').classList.remove('hidden');$('machineGrid').classList.add('hidden');document.querySelector('.fleet-section-head')?.classList.add('hidden');await refreshSelected();window.scrollTo({top:0,behavior:'smooth'})}
function closeMachine(){$('detailShell').classList.add('hidden');$('machineGrid').classList.remove('hidden');document.querySelector('.fleet-section-head')?.classList.remove('hidden');selectedMachineId='';localStorage.removeItem('dglMachineId')}
function renderMachine(m){
  const t=m.telemetry||{},kind=kindOf(m);
  text('machineName',m.name||m.id);text('machineLocation',`${m.location||'UbicaciÃ³n sin definir'} Â· ${m.id}`);
  text('today',money(t.totalToday));text('week',money(t.totalWeek));text('currentCollection',money(m.collection?.current));
  text('in1',money(t.totalIn1));text('in2',money(t.totalIn2));text('out1',money(t.totalOut1));text('out2',money(t.totalOut2));
  text('pending1',`${t.pending1||0} monedas`);text('pending2',`${t.pending2||0} monedas`);text('state1',t.state1||'SIN DATOS');text('state2',t.state2||'SIN DATOS');
  text('wifi',`${t.wifiRssi??'â'} dBm`);text('machineType',kind);text('espStatus',m.online?'Conectado':'Sin conexiÃ³n');text('lastSeen',m.updatedAt?new Date(m.updatedAt).toLocaleString('es-CL'):'Sin datos');
  const wb=$('wifiBadge');if(wb)wb.textContent=t.wifiRssi>-65?'Excelente':t.wifiRssi>-78?'Buena':'DÃ©bil';const p=$('onlinePill');if(p){p.textContent=m.online?'ONLINE':'OFFLINE';p.classList.toggle('online',m.online)}
  const bills=valueAny(t,['totalBills','bills','billTotal','totalBilletes']);const coins=valueAny(t,['totalCoins','coins','coinTotal','totalMonedas']);const cash=valueAny(t,['cashCurrent','currentCash','moneyCurrent','dineroActual']);
  text('bills',bills===null?'â':money(bills));text('coins',coins===null?'â':money(coins));text('cashCurrent',cash===null?'â':money(cash));text('totalOut',money(Number(t.totalOut1||0)+Number(t.totalOut2||0)));
  if($('volume'))$('volume').value=t.audioVolume??22;text('volumeLabel',t.audioVolume??22);$('cascadeSection').classList.toggle('hidden',!isCascade(m));$('futureDeviceCard').classList.toggle('hidden',isCascade(m));
  $('events').innerHTML=(m.events||[]).slice(0,50).map(e=>`<div class="event"><time>${new Date(e.at).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time><p>${escapeHtml(e.message)}</p></div>`).join('')||'<p class="subtle">Sin eventos.</p>';
}
async function refreshSelected(){if(!selectedMachineId)return;const data=await api(`/api/machines/${selectedMachineId}`);renderMachine(data.machine)}
async function command(type,payload={}){if(!selectedMachineId)return toast('Selecciona una mÃ¡quina');try{await api(`/api/machines/${selectedMachineId}/commands`,{method:'POST',body:JSON.stringify({type,payload})});toast(`Comando enviado a ${selectedMachineId}`)}catch(e){toast(e.message)}}

async function confirmRemotePayment(amount){
  const monto=Number(amount),changer=Number($('changer').value);
  if(!Number.isInteger(monto)||monto<100||monto>20000||monto%100!==0)return toast('Monto invÃ¡lido');
  const code=window.prompt(`CONFIRMAR PAGO REMOTO\n\nMÃ¡quina: ${selectedMachineId}\nCambiador: ${changer}\nMonto: ${money(monto)}\n\nCÃ³digo de confirmaciÃ³n:`);
  if(code===null)return toast('Pago cancelado');
  if(code.trim()!==ACTION_PIN)return toast('CÃ³digo incorrecto. Pago cancelado.');
  await command('pay',{changer,amount:monto,confirmationCode:code.trim()});
}

function fillCollectionMachineSelector(){
  const select=$('collectionMachineSelect');if(!select)return;
  select.innerHTML=fleet.map(m=>`<option value="${escapeHtml(m.id)}">${escapeHtml(m.name||m.id)} Â· ${escapeHtml(m.id)}</option>`).join('');
  if(!collectionMachineId||!fleet.some(m=>m.id===collectionMachineId))collectionMachineId=fleet[0]?.id||'';
  select.value=collectionMachineId;
}

async function loadCollections(){
  if(!collectionMachineId)return;
  const data=await api(`/api/machines/${collectionMachineId}/collections`);
  text('collectionCurrent',money(data.current));text('collectionHistoric',money(data.historic));text('collectionTotal',money(data.totalCollected));text('collectionCount',data.collections.length);
  const list=$('collectionsList');
  list.innerHTML=(data.collections||[]).map(item=>`<div class="collection-row"><time>${new Date(item.at).toLocaleString('es-CL')}</time><div><b>${money(item.amount)}</b><small>HistÃ³rico al cierre: ${money(item.historicAtCollection)}</small></div><span class="tiny-badge">Registrada</span></div>`).join('')||'<p class="subtle">Sin recaudaciones registradas.</p>';
}

async function registerCollection(){
  if(!collectionMachineId)return toast('Selecciona una mÃ¡quina');
  const machine=fleet.find(m=>m.id===collectionMachineId);const current=machine?.collection?.current??0;
  const code=window.prompt(`REGISTRAR RECAUDACIÃN\n\nMÃ¡quina: ${machine?.name||collectionMachineId}\nMonto actual: ${money(current)}\n\nCÃ³digo de confirmaciÃ³n:`);
  if(code===null)return toast('RecaudaciÃ³n cancelada');
  if(code.trim()!==ACTION_PIN)return toast('CÃ³digo incorrecto. No se registrÃ³ nada.');
  try{
    const result=await api(`/api/machines/${collectionMachineId}/collections`,{method:'POST',body:JSON.stringify({pin:code.trim()})});
    toast(`RecaudaciÃ³n guardada: ${money(result.collection.amount)}`);
    await loadFleet();await loadCollections();if(selectedMachineId===collectionMachineId)await refreshSelected();
  }catch(e){toast(e.message)}
}

function showPanel(){
  $('panelView').classList.remove('hidden');$('collectionView').classList.add('hidden');$('panelNavBtn').classList.add('active');$('collectionNavBtn').classList.remove('active');
}
async function showCollections(){
  $('panelView').classList.add('hidden');$('collectionView').classList.remove('hidden');$('panelNavBtn').classList.remove('active');$('collectionNavBtn').classList.add('active');fillCollectionMachineSelector();await loadCollections();window.scrollTo({top:0,behavior:'smooth'});
}

async function login(){adminKey=$('adminKey').value.trim();try{await api('/api/login',{method:'POST',body:JSON.stringify({key:adminKey})});localStorage.setItem('dglAdminKey',adminKey);$('login').classList.add('hidden');text('loginError','');await loadFleet();if(selectedMachineId&&fleet.some(m=>m.id===selectedMachineId))await openMachine(selectedMachineId)}catch(e){text('loginError','Clave incorrecta')}}

$('loginBtn').onclick=login;$('adminKey').onkeydown=e=>{if(e.key==='Enter')login()};$('logoutBtn').onclick=()=>{localStorage.removeItem('dglAdminKey');localStorage.removeItem('dglMachineId');location.reload()};
$('panelNavBtn').onclick=showPanel;$('collectionNavBtn').onclick=()=>showCollections().catch(e=>toast(e.message));$('backBtn').onclick=closeMachine;$('refreshFleetBtn').onclick=()=>loadFleet().catch(e=>toast(e.message));$('refreshDetailBtn').onclick=()=>refreshSelected().catch(e=>toast(e.message));
$('payBtn').onclick=()=>confirmRemotePayment($('amount').value);document.querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>confirmRemotePayment(b.dataset.pay));document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>b.dataset.command==='set_mute'?command('set_mute',{muted:b.dataset.value==='true'}):command(b.dataset.command,{}));
let volumeTimer;$('volume').oninput=e=>{text('volumeLabel',e.target.value);clearTimeout(volumeTimer);volumeTimer=setTimeout(()=>command('set_volume',{volume:Number(e.target.value)}),500)};$('voiceBtn').onclick=()=>command('play_voice',{voice:Number($('voice').value)});
$('collectionMachineSelect').onchange=e=>{collectionMachineId=e.target.value;localStorage.setItem('dglCollectionMachineId',collectionMachineId);loadCollections().catch(err=>toast(err.message))};$('registerCollectionBtn').onclick=registerCollection;$('refreshCollectionsBtn').onclick=()=>loadCollections().catch(e=>toast(e.message));

async function start(){if(!adminKey)return;$('login').classList.add('hidden');try{await loadFleet();if(selectedMachineId&&fleet.some(m=>m.id===selectedMachineId))await openMachine(selectedMachineId)}catch(e){$('login').classList.remove('hidden')}}
start();setInterval(()=>{if(adminKey){loadFleet().catch(()=>{});if(selectedMachineId)refreshSelected().catch(()=>{});if(!$('collectionView').classList.contains('hidden'))loadCollections().catch(()=>{})}},5000);
