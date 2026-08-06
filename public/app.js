const $ = id => document.getElementById(id);

const money = value =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(Number(value || 0));

let adminKey = localStorage.getItem('dglAdminKey') || '';
let machineId = localStorage.getItem('dglMachineId') || 'DGL-01';

function toast(message) {
  const element = $('toast');

  if (!element) {
    console.log(message);
    return;
  }

  element.textContent = message;
  element.classList.add('show');

  setTimeout(() => {
    element.classList.remove('show');
  }, 2200);
}

async function api(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (adminKey) {
    headers['x-admin-key'] = adminKey;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Error HTTP ${response.status}`);
  }

  return data;
}

function text(id, value) {
  const element = $(id);

  if (element) {
    element.textContent = value;
  }
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      })[character]
  );
}

function render(machine) {
  const telemetry = machine.telemetry || {};

  text('machineName', machine.name || machine.id);
  text('machineLocation', machine.location || machine.id);

  text('today', money(telemetry.totalToday));
  text('week', money(telemetry.totalWeek));
  text('month', money(telemetry.totalMonth));
  text('historic', money(telemetry.totalHistoric));

  text('in1', money(telemetry.totalIn1));
  text('in2', money(telemetry.totalIn2));
  text('out1', money(telemetry.totalOut1));
  text('out2', money(telemetry.totalOut2));

  text('pending1', `${telemetry.pending1 || 0} monedas`);
  text('pending2', `${telemetry.pending2 || 0} monedas`);

  text('state1', telemetry.state1 || 'SIN DATOS');
  text('state2', telemetry.state2 || 'SIN DATOS');

  text('wifi', `WiFi: ${telemetry.wifiRssi ?? -100} dBm`);

  if ($('volume')) {
    $('volume').value = telemetry.audioVolume ?? 22;
  }

  text('volumeLabel', telemetry.audioVolume ?? 22);

  const onlinePill = $('onlinePill');

  if (onlinePill) {
    onlinePill.textContent = machine.online ? 'ONLINE' : 'OFFLINE';
    onlinePill.classList.toggle('online', machine.online);
  }

  const globalStatus = $('globalStatus');

  if (globalStatus) {
    globalStatus.innerHTML =
      `<span></span>${machine.online ? 'Conectada' : 'Sin conexión'}`;
  }

  const events = $('events');

  if (events) {
    events.innerHTML =
      (machine.events || [])
        .slice(0, 30)
        .map(
          event => `
            <div class="event">
              <time>
                ${new Date(event.at).toLocaleString('es-CL', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </time>
              <p>${escapeHtml(event.message)}</p>
            </div>
          `
        )
        .join('') || '<p class="muted">Sin eventos.</p>';
  }
}

async function login() {
  adminKey = $('adminKey').value.trim();

  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        key: adminKey
      })
    });

    localStorage.setItem('dglAdminKey', adminKey);

    if ($('login')) {
      $('login').classList.add('hidden');
    }

    if ($('loginError')) {
      $('loginError').textContent = '';
    }

    await loadMachines();
    await refresh();
  } catch (error) {
    if ($('loginError')) {
      $('loginError').textContent = 'Clave incorrecta';
    }
  }
}

async function loadMachines() {
  const data = await api('/api/machines');
  const selector = $('machineSelect');

  if (!selector) {
    console.error('Falta machineSelect en index.html');
    return;
  }

  selector.innerHTML = '';

  data.machines.forEach(machine => {
    const option = document.createElement('option');

    option.value = machine.id;
    option.textContent =
      `${machine.name || machine.id} — ` +
      `${machine.online ? 'ONLINE' : 'OFFLINE'}`;

    selector.appendChild(option);
  });

  const machineExists = data.machines.some(
    machine => machine.id === machineId
  );

  if (!machineExists && data.machines.length > 0) {
    machineId = data.machines[0].id;
    localStorage.setItem('dglMachineId', machineId);
  }

  selector.value = machineId;
}

async function refresh() {
  if (!adminKey || !machineId) {
    return;
  }

  try {
    const data = await api(`/api/machines/${machineId}`);
    render(data.machine);
  } catch (error) {
    if (
      error.message.toLowerCase().includes('clave') ||
      error.message.includes('401')
    ) {
      if ($('login')) {
        $('login').classList.remove('hidden');
      }
    } else if ($('globalStatus')) {
      $('globalStatus').innerHTML =
        '<span></span>Servidor desconectado';
    }
  }
}

async function command(type, payload = {}) {
  if (!machineId) {
    toast('Selecciona una máquina');
    return;
  }

  try {
    await api(`/api/machines/${machineId}/commands`, {
      method: 'POST',
      body: JSON.stringify({
        type,
        payload
      })
    });

    toast(`Comando enviado a ${machineId}`);
  } catch (error) {
    toast(error.message);
  }
}

if ($('machineSelect')) {
  $('machineSelect').onchange = event => {
    machineId = event.target.value;

    localStorage.setItem('dglMachineId', machineId);

    refresh();
  };
}

if ($('loginBtn')) {
  $('loginBtn').onclick = login;
}

if ($('adminKey')) {
  $('adminKey').onkeydown = event => {
    if (event.key === 'Enter') {
      login();
    }
  };
}

if ($('logoutBtn')) {
  $('logoutBtn').onclick = () => {
    localStorage.removeItem('dglAdminKey');
    localStorage.removeItem('dglMachineId');
    location.reload();
  };
}

if ($('payBtn')) {
  $('payBtn').onclick = () =>
    command('pay', {
      changer: Number($('changer').value),
      amount: Number($('amount').value)
    });
}

document.querySelectorAll('[data-pay]').forEach(button => {
  button.onclick = () =>
    command('pay', {
      changer: Number($('changer').value),
      amount: Number(button.dataset.pay)
    });
});

document.querySelectorAll('[data-command]').forEach(button => {
  button.onclick = () => {
    const commandType = button.dataset.command;

    if (commandType === 'set_mute') {
      command('set_mute', {
        muted: button.dataset.value === 'true'
      });

      return;
    }

    if (commandType === 'reset_error') {
      command('reset_error', {
        changer: Number(button.dataset.changer || 0)
      });

      return;
    }

    if (commandType === 'enable_acceptors') {
      command('enable_acceptors', {
        changer: Number(button.dataset.changer || 0),
        enabled: button.dataset.value === 'true'
      });

      return;
    }

    if (commandType === 'hopper_manual') {
      command('hopper_manual', {
        changer: Number(button.dataset.changer || 1),
        enabled: button.dataset.value === 'true'
      });

      return;
    }

    command(commandType, {});
  };
});

let volumeTimer;

if ($('volume')) {
  $('volume').oninput = event => {
    text('volumeLabel', event.target.value);

    clearTimeout(volumeTimer);

    volumeTimer = setTimeout(() => {
      command('set_volume', {
        volume: Number(event.target.value)
      });
    }, 500);
  };
}

if ($('voiceBtn')) {
  $('voiceBtn').onclick = () =>
    command('play_voice', {
      voice: Number($('voice').value)
    });
}

async function start() {
  if (!adminKey) {
    if ($('login')) {
      $('login').classList.remove('hidden');
    }

    return;
  }

  if ($('login')) {
    $('login').classList.add('hidden');
  }

  try {
    await loadMachines();
    await refresh();
  } catch (error) {
    if ($('login')) {
      $('login').classList.remove('hidden');
    }
  }
}

start();

setInterval(refresh, 2500);
setInterval(loadMachines, 15000);