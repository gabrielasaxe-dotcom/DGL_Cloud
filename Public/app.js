const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(value||0));
const VOICES = [
  'Espere un momento','Sistema funcionando con normalidad','Algo falló · técnico en breve','Error cambiador 1','Error cambiador 2',
  'Por favor no golpee la máquina','Por favor no mueva la máquina','Sin monedas suficientes','¿No sabes cómo jugar?','Acércate aquí y prueba tu suerte',
  'Hoy es tu día de suerte','La máquina cuenta con cambiadores','Aquí no mi amor','Mucha suerte en tu próxima jugada','Sistema restablecido correctamente',
  'La suerte podría estar a solo un intento','Sigue intentándolo','Golpear no aumenta las probabilidades','Ganador Pelucheras','Ven y conoce Devine Golden Luck',
  'Cambia tus billetes por monedas aquí','Prohibido mover o golpear la máquina','Inconvenientes · WhatsApp','Transferencia · WhatsApp','Bono de cliente frecuente'
];

let adminKey = localStorage.getItem('dglAdminKey') || '';
let machineId = localStorage.getItem('dglMachineId') || 'DGL-01';
let currentMachine = null;
let collectionData = null;
let refreshTimer = null;
let pendingModalAction = null;

function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600);}
async function api(url,options={}){
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(adminKey) headers['x-admin-key']=adminKey;
  const response=await fetch(url,{...options,headers});
  let data={};
  try{data=await response.json();}catch(_){data={error:'Respuesta inválida del servidor'};}
  if(!response.ok) throw new Error(data.error||`Error HTTP ${response.status}`);
  return data;
}
function setText(id,value){const el=$(id);if(el)el.textContent=value;}
function fmtDate(iso){if(!iso)return '—';return new Date(iso).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'});}

async function login(){
  adminKey=$('adminKey').value.trim();
  $('loginError').textContent='';
  try{
    await api('/api/login',{method:'POST',body:JSON.stringify({key:adminKey})});
    localStorage.setItem('dglAdminKey',adminKey);
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    await loadMachines();
    await refresh();
    startRefresh();
  }catch(error){$('loginError').textContent='Clave incorrecta o servidor no disponible';}
}
function logout(){localStorage.removeItem('dglAdminKey');adminKey='';location.reload();}

async function loadMachines(){
  const data=await api('/api/machines');
  const selector=$('machineSelect');
  selector.innerHTML='';
  data.machines.forEach(machine=>{
    const o=document.createElement('option');
    o.value=machine.id;
    o.textContent=`${machine.name||machine.id} · ${machine.online?'ONLINE':'OFFLINE'}`;
    selector.appendChild(o);
  });
  if(!data.machines.some(m=>m.id===machineId)&&data.machines.length) machineId=data.machines[0].id;
  selector.value=machineId;
  localStorage.setItem('dglMachineId',machineId);
}

function render(machine){
  currentMachine=machine;
  const t=machine.telemetry||{};
  setText('machineName',machine.name||machine.id);
  setText('machineLocation',machine.location||'Sin ubicación');
  setText('collectionCurrent',money(machine.collectionCurrent));
  setText('collectionCurrent2',money(machine.collectionCurrent));
  setText('collectionSince',machine.collectionSince?`Desde ${fmtDate(machine.collectionSince)}`:'Desde el inicio del registro');
  setText('today',money(t.totalToday));
  setText('month',money(machine.collectionCurrent));
  setText('in1',money(t.totalIn1));
  setText('in2',money(t.totalIn2));
  setText('out1',money(t.totalOut1));
  setText('out2',money(t.totalOut2));
  setText('pending1',`${t.pending1||0} monedas`);
  setText('pending2',`${t.pending2||0} monedas`);
  setText('state1',t.state1||'SIN DATOS');
  setText('state2',t.state2||'SIN DATOS');
  setText('wifi',`WiFi: ${t.wifiRssi??-100} dBm`);
  setText('lastSeen',fmtDate(machine.updatedAt));
  setText('volumeSummary',`${t.audioVolume??22}/30`);
  setText('collectionsCount',machine.collectionsCount||0);
  setText('cloudSummary',machine.online?'ONLINE':'OFFLINE');
  $('volume').value=t.audioVolume??22;
  setText('volumeLabel',t.audioVolume??22);
  const pill=$('onlinePill');
  pill.textContent=machine.online?'ONLINE':'OFFLINE';
  pill.classList.toggle('online',machine.online);
  const status=$('globalStatus');
  status.innerHTML=`<span></span>${machine.online?'Conectada':'Sin conexión'}`;
  status.classList.toggle('online',machine.online);
  renderEvents(machine.events||[]);
}
function renderEvents(events){
  $('events').innerHTML=events.slice(0,80).map(e=>`<div class="event"><time>${escapeHtml(fmtDate(e.at))}</time><p>${escapeHtml(e.message||e.type||'Evento')}</p></div>`).join('')||'<p class="muted">Sin eventos.</p>';
}

async function refresh(){
  if(!adminKey||!machineId)return;
  try{
    const data=await api(`/api/machines/${machineId}`);
    render(data.machine);
    if(document.querySelector('#view-collections.active')) await loadCollections(false);
  }catch(error){
    if(error.message.toLowerCase().includes('clave')){$('login').classList.remove('hidden');$('app').classList.add('hidden');}
    else{const s=$('globalStatus');s.innerHTML='<span></span>Servidor desconectado';s.classList.remove('online');}
  }
}
function startRefresh(){
  clearInterval(refreshTimer);
  let ticks=0;
  refreshTimer=setInterval(async()=>{
    await refresh();
    ticks++;
    if(ticks%12===0) await loadMachines().catch(()=>{});
  },2500);
}

async function command(type,payload={}){
  const data=await api(`/api/machines/${machineId}/commands`,{method:'POST',body:JSON.stringify({type,payload})});
  toast(`Comando enviado a ${machineId}`);
  return data;
}

function openModal({title,text,showNote=false,onConfirm}){
  $('modalTitle').textContent=title;
  $('modalText').textContent=text;
  $('modalPin').value='';
  $('modalNote').value='';
  $('modalError').textContent='';
  $('noteWrap').classList.toggle('hidden',!showNote);
  $('modalNote').classList.toggle('hidden',!showNote);
  pendingModalAction=onConfirm;
  $('modal').classList.remove('hidden');
  setTimeout(()=>$('modalPin').focus(),50);
}
function closeModal(){$('modal').classList.add('hidden');pendingModalAction=null;}
async function confirmModal(){
  if(!pendingModalAction)return;
  const pin=$('modalPin').value.trim();
  const note=$('modalNote').value.trim();
  $('modalError').textContent='';
  $('modalConfirm').disabled=true;
  try{await pendingModalAction(pin,note);closeModal();}
  catch(error){$('modalError').textContent=error.message;}
  finally{$('modalConfirm').disabled=false;}
}

function requestPayment(amount){
  const changer=Number($('changer').value);
  amount=Number(amount);
  if(!Number.isInteger(amount)||amount<100){toast('Monto inválido');return;}
  openModal({
    title:'Confirmar pago remoto',
    text:`${currentMachine?.name||machineId} · Cambiador ${changer} · ${money(amount)}. Ingresa el código 2324 para autorizar la entrega.`,
    onConfirm:async pin=>{await command('pay',{changer,amount,confirmationCode:pin});}
  });
}

async function loadCollections(showToast=false){
  try{
    const data=await api(`/api/machines/${machineId}/collections`);
    collectionData=data.machine;
    setText('collectionCurrent2',money(collectionData.current));
    setText('collectedTotal',money(collectionData.totalCollected));
    setText('collectedCount',`${collectionData.count} ${collectionData.count===1?'registro':'registros'}`);
    setText('historicHidden',money(collectionData.totalHistoric));
    renderCollections(collectionData.collections||[]);
    if(showToast)toast('Recaudación actualizada');
  }catch(error){if(showToast)toast(error.message);}
}
function renderCollections(items){
  $('collectionsTable').innerHTML=items.map((item,index)=>`<div class="collection-row"><div><strong>#${items.length-index}</strong><br><span>${escapeHtml(fmtDate(item.at))}</span></div><div><span>Recaudado</span><br><strong>${money(item.amount)}</strong></div><div><span>Histórico al retiro</span><br><strong>${money(item.historicAtCollection)}</strong></div><div><span>${escapeHtml(item.note||'Sin nota')}</span></div></div>`).join('')||'<p class="muted">Sin recaudaciones todavía.</p>';
}
function registerCollection(){
  if(!currentMachine?.online){toast('La máquina debe estar ONLINE para recaudar');return;}
  openModal({
    title:'Registrar recaudación',
    text:`Se guardará el monto actual de ${currentMachine.name} y el contador visible volverá a $0. El histórico real NO se borra.`,
    showNote:true,
    onConfirm:async(pin,note)=>{
      const data=await api(`/api/machines/${machineId}/collections`,{method:'POST',body:JSON.stringify({pin,note})});
      toast(`Recaudación guardada: ${money(data.collection.amount)}`);
      await refresh();
      await loadCollections();
    }
  });
}
function exportCollections(){
  if(!collectionData)return;
  const rows=[['Fecha','Maquina','Monto recaudado','Historico al retiro','Hoy al retiro','Mes al retiro','Nota'],...(collectionData.collections||[]).map(i=>[i.at,collectionData.name,i.amount,i.historicAtCollection,i.todayAtCollection,i.monthAtCollection,i.note||''])];
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`recaudaciones_${machineId}.csv`;a.click();URL.revokeObjectURL(a.href);
}

function switchView(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $(`view-${view}`).classList.add('active');
  const titles={dashboard:'Dashboard',control:'Control',collections:'Recaudación',activity:'Actividad'};
  setText('viewTitle',titles[view]||'DGL');
  if(view==='collections')loadCollections();
}
function initVoices(){
  const select=$('voice');
  VOICES.forEach((label,index)=>{const o=document.createElement('option');o.value=index+1;o.textContent=`${String(index+1).padStart(2,'0')} · ${label}`;select.appendChild(o);});
}

$('loginBtn').onclick=login;
$('adminKey').onkeydown=e=>{if(e.key==='Enter')login();};
$('logoutBtn').onclick=logout;
$('machineSelect').onchange=async e=>{machineId=e.target.value;localStorage.setItem('dglMachineId',machineId);await refresh();};
document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
$('payBtn').onclick=()=>requestPayment($('amount').value);
document.querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>requestPayment(b.dataset.pay));
document.querySelectorAll('[data-command]').forEach(button=>{
  button.onclick=async()=>{
    const type=button.dataset.command;
    try{
      if(type==='set_mute') await command(type,{muted:button.dataset.value==='true'});
      else if(type==='enable_acceptors') await command(type,{enabled:button.dataset.enabled==='true'});
      else await command(type,{});
    }catch(error){toast(error.message);}
  };
});
let volumeTimer;
$('volume').oninput=e=>{
  setText('volumeLabel',e.target.value);
  clearTimeout(volumeTimer);
  volumeTimer=setTimeout(()=>command('set_volume',{volume:Number(e.target.value)}).catch(err=>toast(err.message)),500);
};
$('voiceBtn').onclick=()=>command('play_voice',{voice:Number($('voice').value)}).catch(e=>toast(e.message));
$('collectBtn').onclick=registerCollection;
$('revealHistoric').onclick=()=>{const card=$('historicHidden').closest('.secret');card.classList.toggle('revealed');$('revealHistoric').textContent=card.classList.contains('revealed')?'Ocultar':'Mostrar';};
$('exportCollections').onclick=exportCollections;
$('modalClose').onclick=closeModal;
$('modalConfirm').onclick=confirmModal;
$('modalPin').onkeydown=e=>{if(e.key==='Enter')confirmModal();};
$('modal').onclick=e=>{if(e.target===$('modal'))closeModal();};

async function start(){
  initVoices();
  if(!adminKey)return;
  try{
    await api('/api/login',{method:'POST',body:JSON.stringify({key:adminKey})});
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    await loadMachines();
    await refresh();
    startRefresh();
  }catch(_){localStorage.removeItem('dglAdminKey');adminKey='';}
}
start();
