const $ = id => document.getElementById(id);

const money = value =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(Number(value || 0));

const VOICES = [
  'Espere un momento',
  'Sistema funcionando con normalidad',
  'Algo falló · técnico en breve',
  'Error cambiador 1',
  'Error cambiador 2',
  'Por favor no golpee la máquina',
  'Por favor no mueva la máquina',
  'Sin monedas suficientes',
  '¿No sabes cómo jugar?',
  'Acércate aquí y prueba tu suerte',
  'Hoy es tu día de suerte',
  'La máquina cuenta con cambiadores',
  'Aquí no mi amor',
  'Mucha suerte en tu próxima jugada',
  'Sistema restablecido correctamente',
  'La suerte podría estar a solo un intento',
  'Sigue intentándolo',
  'Golpear no aumenta las probabilidades',
  'Ganador Pelucheras',
  'Ven y conoce Devine Golden Luck',
  'Cambia tus billetes por monedas aquí',
  'Prohibido mover o golpear la máquina',
  'Inconvenientes · WhatsApp',
  'Transferencia · WhatsApp',
  'Bono de cliente frecuente'
];

let adminKey = localStorage.getItem('dglAdminKey') || '';
let machineId = localStorage.getItem('dglMachineId') || 'DGL-01';

let currentMachine = null;
let collectionData = null;
let refreshTimer = null;
let pendingModalAction = null;


/* =========================================================
   UTILIDADES
========================================================= */

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>'"]/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[char]
  );
}

function toast(message) {
  const el = $('toast');

  if (!el) {
    return;
  }

  el.textContent = message;
  el.classList.add('show');

  setTimeout(() => {
    el.classList.remove('show');
  }, 2600);
}

function setText(id, value) {
  const el = $(id);

  if (el) {
    el.textContent = value;
  }
}

function fmtDate(iso) {
  if (!iso) {
    return '—';
  }

  return new Date(iso).toLocaleString(
    'es-CL',
    {
      dateStyle: 'short',
      timeStyle: 'short'
    }
  );
}


/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (adminKey) {
    headers['x-admin-key'] = adminKey;
  }

  const response = await fetch(
    url,
    {
      ...options,
      headers
    }
  );

  let data = {};

  try {
    data = await response.json();
  } catch (_) {
    data = {
      error: 'Respuesta inválida del servidor'
    };
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      `Error HTTP ${response.status}`
    );
  }

  return data;
}


/* =========================================================
   LOGIN
========================================================= */

async function login() {

  adminKey = $('adminKey').value.trim();

  $('loginError').textContent = '';

  try {

    await api(
      '/api/login',
      {
        method: 'POST',
        body: JSON.stringify({
          key: adminKey
        })
      }
    );

    localStorage.setItem(
      'dglAdminKey',
      adminKey
    );

    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');

    await loadMachines();
    await refresh();

    startRefresh();

  } catch (error) {

    $('loginError').textContent =
      'Clave incorrecta o servidor no disponible';
  }
}

function logout() {

  localStorage.removeItem(
    'dglAdminKey'
  );

  adminKey = '';

  location.reload();
}


/* =========================================================
   MÁQUINAS
========================================================= */

async function loadMachines() {

  const data =
    await api('/api/machines');

  const selector =
    $('machineSelect');

  selector.innerHTML = '';

  data.machines.forEach(machine => {

    const option =
      document.createElement('option');

    option.value =
      machine.id;

    option.textContent =
      `${machine.name || machine.id} · ${
        machine.online
          ? 'ONLINE'
          : 'OFFLINE'
      }`;

    selector.appendChild(
      option
    );
  });

  const existe =
    data.machines.some(
      machine =>
        machine.id === machineId
    );

  if (
    !existe &&
    data.machines.length > 0
  ) {
    machineId =
      data.machines[0].id;
  }

  selector.value =
    machineId;

  localStorage.setItem(
    'dglMachineId',
    machineId
  );
}


/* =========================================================
   DASHBOARD
========================================================= */

function render(machine) {

  currentMachine = machine;

  const telemetry =
    machine.telemetry || {};

  setText(
    'machineName',
    machine.name || machine.id
  );

  setText(
    'machineLocation',
    machine.location ||
    'Sin ubicación'
  );


  /* RECAUDACIÓN ACTUAL */

  setText(
    'collectionCurrent',
    money(
      machine.collectionCurrent
    )
  );

  setText(
    'collectionCurrent2',
    money(
      machine.collectionCurrent
    )
  );

  setText(
    'collectionSince',
    machine.collectionSince
      ? `Desde ${fmtDate(
          machine.collectionSince
        )}`
      : 'Desde el inicio del registro'
  );


  /* TOTALES */

  setText(
    'today',
    money(
      telemetry.totalToday
    )
  );

  /*
    Mes / período visible:
    después de recaudar vuelve a 0.
  */

  setText(
    'month',
    money(
      machine.collectionCurrent
    )
  );

  setText(
    'in1',
    money(
      telemetry.totalIn1
    )
  );

  setText(
    'in2',
    money(
      telemetry.totalIn2
    )
  );

  setText(
    'out1',
    money(
      telemetry.totalOut1
    )
  );

  setText(
    'out2',
    money(
      telemetry.totalOut2
    )
  );


  /* HOPPERS */

  setText(
    'pending1',
    `${telemetry.pending1 || 0} monedas`
  );

  setText(
    'pending2',
    `${telemetry.pending2 || 0} monedas`
  );


  /* ESTADOS */

  setText(
    'state1',
    telemetry.state1 ||
    'SIN DATOS'
  );

  setText(
    'state2',
    telemetry.state2 ||
    'SIN DATOS'
  );


  /* WIFI */

  setText(
    'wifi',
    `WiFi: ${
      telemetry.wifiRssi ?? -100
    } dBm`
  );


  /* RESUMEN */

  setText(
    'lastSeen',
    fmtDate(
      machine.updatedAt
    )
  );

  setText(
    'volumeSummary',
    `${telemetry.audioVolume ?? 22}/30`
  );

  setText(
    'collectionsCount',
    machine.collectionsCount || 0
  );

  setText(
    'cloudSummary',
    machine.online
      ? 'ONLINE'
      : 'OFFLINE'
  );


  /* VOLUMEN */

  $('volume').value =
    telemetry.audioVolume ?? 22;

  setText(
    'volumeLabel',
    telemetry.audioVolume ?? 22
  );


  /* ONLINE */

  const pill =
    $('onlinePill');

  pill.textContent =
    machine.online
      ? 'ONLINE'
      : 'OFFLINE';

  pill.classList.toggle(
    'online',
    machine.online
  );


  const status =
    $('globalStatus');

  status.innerHTML =
    `<span></span>${
      machine.online
        ? 'Conectada'
        : 'Sin conexión'
    }`;

  status.classList.toggle(
    'online',
    machine.online
  );


  renderEvents(
    machine.events || []
  );
}


/* =========================================================
   EVENTOS
========================================================= */

function renderEvents(events) {

  const html =
    events
      .slice(0, 80)
      .map(event => {

        return `
          <div class="event">

            <time>
              ${escapeHtml(
                fmtDate(event.at)
              )}
            </time>

            <p>
              ${escapeHtml(
                event.message ||
                event.type ||
                'Evento'
              )}
            </p>

          </div>
        `;
      })
      .join('');

  $('events').innerHTML =
    html ||
    '<p class="muted">Sin eventos.</p>';
}


/* =========================================================
   REFRESH
========================================================= */

async function refresh() {

  if (
    !adminKey ||
    !machineId
  ) {
    return;
  }

  try {

    const data =
      await api(
        `/api/machines/${machineId}`
      );

    render(
      data.machine
    );

    const collectionView =
      document.querySelector(
        '#view-collections.active'
      );

    if (collectionView) {
      await loadCollections(false);
    }

  } catch (error) {

    if (
      error.message
        .toLowerCase()
        .includes('clave')
    ) {

      $('login')
        .classList
        .remove('hidden');

      $('app')
        .classList
        .add('hidden');

    } else {

      const status =
        $('globalStatus');

      status.innerHTML =
        '<span></span>Servidor desconectado';

      status.classList.remove(
        'online'
      );
    }
  }
}

function startRefresh() {

  clearInterval(
    refreshTimer
  );

  let ticks = 0;

  refreshTimer =
    setInterval(
      async () => {

        await refresh();

        ticks++;

        if (
          ticks % 12 === 0
        ) {

          await loadMachines()
            .catch(() => {});
        }

      },
      2500
    );
}


/* =========================================================
   COMANDOS CLOUD
========================================================= */

async function command(
  type,
  payload = {}
) {

  const data =
    await api(
      `/api/machines/${machineId}/commands`,
      {
        method: 'POST',

        body:
          JSON.stringify({
            type,
            payload
          })
      }
    );

  toast(
    `Comando enviado a ${machineId}`
  );

  return data;
}


/* =========================================================
   MODAL PIN
========================================================= */

function openModal({
  title,
  text,
  showNote = false,
  onConfirm
}) {

  $('modalTitle').textContent =
    title;

  $('modalText').textContent =
    text;

  $('modalPin').value = '';

  $('modalNote').value = '';

  $('modalError').textContent = '';

  $('noteWrap')
    .classList
    .toggle(
      'hidden',
      !showNote
    );

  $('modalNote')
    .classList
    .toggle(
      'hidden',
      !showNote
    );

  pendingModalAction =
    onConfirm;

  $('modal')
    .classList
    .remove('hidden');

  setTimeout(
    () => {
      $('modalPin').focus();
    },
    50
  );
}

function closeModal() {

  $('modal')
    .classList
    .add('hidden');

  pendingModalAction =
    null;
}

async function confirmModal() {

  if (!pendingModalAction) {
    return;
  }

  const pin =
    $('modalPin')
      .value
      .trim();

  const note =
    $('modalNote')
      .value
      .trim();

  $('modalError')
    .textContent = '';

  $('modalConfirm')
    .disabled = true;

  try {

    await pendingModalAction(
      pin,
      note
    );

    closeModal();

  } catch (error) {

    $('modalError')
      .textContent =
        error.message;

  } finally {

    $('modalConfirm')
      .disabled = false;
  }
}


/* =========================================================
   PAGO REMOTO
========================================================= */

function requestPayment(amount) {

  const changer =
    Number(
      $('changer').value
    );

  amount =
    Number(amount);

  if (
    !Number.isInteger(amount) ||
    amount < 100 ||
    amount > 20000 ||
    amount % 100 !== 0
  ) {

    toast(
      'Monto inválido'
    );

    return;
  }

  openModal({

    title:
      'Confirmar pago remoto',

    text:
      `${currentMachine?.name || machineId} · ` +
      `Cambiador ${changer} · ` +
      `${money(amount)}. ` +
      `Ingresa el código 2324 para autorizar la entrega.`,

    onConfirm:
      async pin => {

        await command(
          'pay',
          {
            changer,
            amount,
            confirmationCode: pin
          }
        );
      }
  });
}


/* =========================================================
   RECAUDACIONES
========================================================= */

async function loadCollections(
  showToast = false
) {

  try {

    const data =
      await api(
        `/api/machines/${machineId}/collections`
      );

    collectionData =
      data.machine;


    setText(
      'collectionCurrent2',
      money(
        collectionData.current
      )
    );

    setText(
      'collectedTotal',
      money(
        collectionData.totalCollected
      )
    );

    setText(
      'collectedCount',
      `${collectionData.count} ${
        collectionData.count === 1
          ? 'registro'
          : 'registros'
      }`
    );

    setText(
      'historicHidden',
      money(
        collectionData.totalHistoric
      )
    );


    renderCollections(
      collectionData.collections || []
    );


    if (showToast) {

      toast(
        'Recaudación actualizada'
      );
    }

  } catch (error) {

    if (showToast) {

      toast(
        error.message
      );
    }
  }
}

function renderCollections(items) {

  const html =
    items
      .map(
        (item, index) => {

          return `

            <div class="collection-row">

              <div>

                <strong>
                  #${items.length - index}
                </strong>

                <br>

                <span>
                  ${escapeHtml(
                    fmtDate(item.at)
                  )}
                </span>

              </div>


              <div>

                <span>
                  Recaudado
                </span>

                <br>

                <strong>
                  ${money(item.amount)}
                </strong>

              </div>


              <div>

                <span>
                  Histórico al retiro
                </span>

                <br>

                <strong>
                  ${money(
                    item.historicAtCollection
                  )}
                </strong>

              </div>


              <div>

                <span>
                  ${escapeHtml(
                    item.note ||
                    'Sin nota'
                  )}
                </span>

              </div>

            </div>
          `;
        }
      )
      .join('');

  $('collectionsTable')
    .innerHTML =
      html ||
      '<p class="muted">Sin recaudaciones todavía.</p>';
}

function registerCollection() {

  if (
    !currentMachine?.online
  ) {

    toast(
      'La máquina debe estar ONLINE para recaudar'
    );

    return;
  }


  openModal({

    title:
      'Registrar recaudación',

    text:
      `Se guardará el monto actual de ${currentMachine.name} ` +
      `y el contador visible volverá a $0. ` +
      `El histórico real NO se borra.`,

    showNote: true,

    onConfirm:
      async (
        pin,
        note
      ) => {

        const data =
          await api(
            `/api/machines/${machineId}/collections`,
            {
              method: 'POST',

              body:
                JSON.stringify({
                  pin,
                  note
                })
            }
          );


        toast(
          `Recaudación guardada: ${
            money(
              data.collection.amount
            )
          }`
        );


        await refresh();

        await loadCollections();
      }
  });
}


/* =========================================================
   EXPORTAR RECAUDACIONES CSV
========================================================= */

function exportCollections() {

  if (!collectionData) {
    return;
  }

  const rows = [

    [
      'Fecha',
      'Maquina',
      'Monto recaudado',
      'Historico al retiro',
      'Hoy al retiro',
      'Mes al retiro',
      'Nota'
    ],

    ...(
      collectionData.collections || []
    ).map(item => [

      item.at,

      collectionData.name,

      item.amount,

      item.historicAtCollection,

      item.todayAtCollection,

      item.monthAtCollection,

      item.note || ''
    ])
  ];


  const csv =
    rows
      .map(
        row =>
          row
            .map(
              value =>
                `"${String(
                  value ?? ''
                ).replaceAll(
                  '"',
                  '""'
                )}"`
            )
            .join(';')
      )
      .join('\n');


  const blob =
    new Blob(
      [
        '\ufeff' +
        csv
      ],
      {
        type:
          'text/csv;charset=utf-8'
      }
    );


  const link =
    document.createElement('a');

  link.href =
    URL.createObjectURL(blob);

  link.download =
    `recaudaciones_${machineId}.csv`;

  link.click();

  URL.revokeObjectURL(
    link.href
  );
}


/* =========================================================
   NAVEGACIÓN
========================================================= */

function switchView(view) {

  document
    .querySelectorAll('.view')
    .forEach(
      element =>
        element
          .classList
          .remove('active')
    );


  document
    .querySelectorAll('.nav-btn')
    .forEach(
      button =>
        button
          .classList
          .toggle(
            'active',
            button.dataset.view === view
          )
    );


  const target =
    $(`view-${view}`);

  if (target) {

    target
      .classList
      .add('active');
  }


  const titles = {

    dashboard:
      'Dashboard',

    control:
      'Control',

    collections:
      'Recaudación',

    activity:
      'Actividad'
  };


  setText(
    'viewTitle',
    titles[view] ||
    'DGL'
  );


  if (
    view ===
    'collections'
  ) {

    loadCollections();
  }
}


/* =========================================================
   VOCES
========================================================= */

function initVoices() {

  const select =
    $('voice');

  VOICES.forEach(
    (
      label,
      index
    ) => {

      const option =
        document.createElement(
          'option'
        );

      option.value =
        index + 1;

      option.textContent =
        `${String(
          index + 1
        ).padStart(
          2,
          '0'
        )} · ${label}`;

      select.appendChild(
        option
      );
    }
  );
}


/* =========================================================
   BOTONES
========================================================= */

$('loginBtn').onclick =
  login;


$('adminKey').onkeydown =
  event => {

    if (
      event.key ===
      'Enter'
    ) {

      login();
    }
  };


$('logoutBtn').onclick =
  logout;


$('machineSelect').onchange =
  async event => {

    machineId =
      event.target.value;

    localStorage.setItem(
      'dglMachineId',
      machineId
    );

    await refresh();
  };


document
  .querySelectorAll(
    '.nav-btn'
  )
  .forEach(
    button => {

      button.onclick =
        () =>
          switchView(
            button.dataset.view
          );
    }
  );


/* PAGO ESCRITO */

$('payBtn').onclick =
  () =>
    requestPayment(
      $('amount').value
    );


/* PAGOS RÁPIDOS */

document
  .querySelectorAll(
    '[data-pay]'
  )
  .forEach(
    button => {

      button.onclick =
        () =>
          requestPayment(
            button.dataset.pay
          );
    }
  );


/* COMANDOS GENERALES */

document
  .querySelectorAll(
    '[data-command]'
  )
  .forEach(
    button => {

      button.onclick =
        async () => {

          const type =
            button.dataset.command;

          try {

            if (
              type ===
              'set_mute'
            ) {

              await command(
                type,
                {
                  muted:
                    button.dataset.value ===
                    'true'
                }
              );

            } else if (
              type ===
              'enable_acceptors'
            ) {

              await command(
                type,
                {
                  enabled:
                    button.dataset.enabled ===
                    'true'
                }
              );

            } else {

              await command(
                type,
                {}
              );
            }

          } catch (error) {

            toast(
              error.message
            );
          }
        };
    }
  );


/* VOLUMEN */

let volumeTimer;

$('volume').oninput =
  event => {

    setText(
      'volumeLabel',
      event.target.value
    );

    clearTimeout(
      volumeTimer
    );

    volumeTimer =
      setTimeout(
        () =>
          command(
            'set_volume',
            {
              volume:
                Number(
                  event.target.value
                )
            }
          )
          .catch(
            error =>
              toast(
                error.message
              )
          ),
        500
      );
  };


/* VOZ */

$('voiceBtn').onclick =
  () =>
    command(
      'play_voice',
      {
        voice:
          Number(
            $('voice').value
          )
      }
    )
    .catch(
      error =>
        toast(
          error.message
        )
    );


/* RECAUDACIÓN */

$('collectBtn').onclick =
  registerCollection;


/* MOSTRAR HISTÓRICO */

$('revealHistoric').onclick =
  () => {

    const card =
      $('historicHidden')
        .closest(
          '.secret'
        );

    card
      .classList
      .toggle(
        'revealed'
      );

    $('revealHistoric')
      .textContent =
        card
          .classList
          .contains(
            'revealed'
          )
          ? 'Ocultar'
          : 'Mostrar';
  };


/* CSV */

$('exportCollections').onclick =
  exportCollections;


/* MODAL */

$('modalClose').onclick =
  closeModal;

$('modalConfirm').onclick =
  confirmModal;

$('modalPin').onkeydown =
  event => {

    if (
      event.key ===
      'Enter'
    ) {

      confirmModal();
    }
  };

$('modal').onclick =
  event => {

    if (
      event.target ===
      $('modal')
    ) {

      closeModal();
    }
  };


/* =========================================================
   ARRANQUE
========================================================= */

async function start() {

  initVoices();

  if (!adminKey) {
    return;
  }

  try {

    await api(
      '/api/login',
      {
        method: 'POST',
        body:
          JSON.stringify({
            key: adminKey
          })
      }
    );

    $('login')
      .classList
      .add('hidden');

    $('app')
      .classList
      .remove('hidden');


    await loadMachines();

    await refresh();

    startRefresh();

  } catch (_) {

    localStorage.removeItem(
      'dglAdminKey'
    );

    adminKey = '';
  }
}

start();
