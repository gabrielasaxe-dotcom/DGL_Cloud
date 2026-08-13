'use strict';

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DEVICE_API_KEY = process.env.DGL_DEVICE_API_KEY || 'CAMBIA-ESTA-CLAVE-DGL';
const ADMIN_KEY = process.env.DGL_ADMIN_KEY || 'CAMBIA-ESTA-CLAVE-ADMIN';
const ACTION_PIN = String(process.env.DGL_ACTION_PIN || '2324');
const DATA_FILE = path.join(__dirname, 'data', 'store.json');

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function baseTelemetry() {
  return {
    totalToday: 0,
    totalWeek: 0,
    totalMonth: 0,
    totalHistoric: 0,
    totalIn1: 0,
    totalIn2: 0,
    totalOut1: 0,
    totalOut2: 0,
    pending1: 0,
    pending2: 0,
    state1: 'SIN DATOS',
    state2: 'SIN DATOS',
    wifiRssi: -100,
    audioVolume: 22,
    muted: false,
    error1: false,
    error2: false
  };
}

function newMachine(id, name = id) {
  return {
    id,
    name,
    location: '',
    updatedAt: null,
    telemetry: baseTelemetry(),
    events: [],
    commands: [],
    collections: [],
    collectionBaseHistoric: 0
  };
}

function initialStore() {
  return { machines: {} };
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (_) {
    const fresh = initialStore();
    saveStore(fresh);
    return fresh;
  }
}

let store = loadStore();

function migrateMachine(machine) {
  if (!machine.telemetry || typeof machine.telemetry !== 'object') machine.telemetry = baseTelemetry();
  machine.telemetry = { ...baseTelemetry(), ...machine.telemetry };
  if (!Array.isArray(machine.events)) machine.events = [];
  if (!Array.isArray(machine.commands)) machine.commands = [];
  if (!Array.isArray(machine.collections)) machine.collections = [];
  if (!Number.isFinite(Number(machine.collectionBaseHistoric))) machine.collectionBaseHistoric = 0;
  return machine;
}

Object.values(store.machines || {}).forEach(migrateMachine);
saveStore(store);

function requireDeviceKey(req, res, next) {
  if (req.get('x-api-key') !== DEVICE_API_KEY) {
    return res.status(401).json({ ok: false, error: 'API key invÃ¡lida' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.get('x-admin-key') !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: 'Clave de administraciÃ³n invÃ¡lida' });
  }
  next();
}

function requireActionPin(pin) {
  return String(pin ?? '').trim() === ACTION_PIN;
}

function getMachine(id) {
  const machine = store.machines?.[id] || null;
  return machine ? migrateMachine(machine) : null;
}

function ensureMachine(id, name = id) {
  if (!store.machines) store.machines = {};
  if (!store.machines[id]) store.machines[id] = newMachine(id, name);
  return migrateMachine(store.machines[id]);
}

function number(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function collectionCurrent(machine) {
  const historic = number(machine.telemetry?.totalHistoric);
  let base = number(machine.collectionBaseHistoric);
  // Si el ESP32 fue reseteado/borrado y el histÃ³rico bajÃ³, evitamos negativos.
  if (historic < base) base = 0;
  return Math.max(0, historic - base);
}

function collectionsTotal(machine) {
  return machine.collections.reduce((sum, item) => sum + number(item.amount), 0);
}

function publicMachine(machine) {
  migrateMachine(machine);
  const lastSeen = machine.updatedAt ? Date.parse(machine.updatedAt) : 0;
  return {
    id: machine.id,
    name: machine.name,
    location: machine.location,
    updatedAt: machine.updatedAt,
    telemetry: machine.telemetry,
    events: machine.events,
    online: Boolean(lastSeen && Date.now() - lastSeen < 15000),
    collection: {
      current: collectionCurrent(machine),
      count: machine.collections.length,
      totalCollected: collectionsTotal(machine)
    }
  };
}

app.post('/api/login', (req, res) => {
  if (String(req.body?.key || '') !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: 'Clave incorrecta' });
  }
  res.json({ ok: true });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'DGL Cloud', now: new Date().toISOString() });
});

app.get('/api/machines', requireAdmin, (_req, res) => {
  res.json({ ok: true, machines: Object.values(store.machines || {}).map(publicMachine) });
});

app.get('/api/machines/:id', requireAdmin, (req, res) => {
  const machine = getMachine(req.params.id);
  if (!machine) return res.status(404).json({ ok: false, error: 'MÃ¡quina no encontrada' });
  res.json({ ok: true, machine: publicMachine(machine) });
});

app.get('/api/machines/:id/collections', requireAdmin, (req, res) => {
  const machine = getMachine(req.params.id);
  if (!machine) return res.status(404).json({ ok: false, error: 'MÃ¡quina no encontrada' });
  res.json({
    ok: true,
    machine: { id: machine.id, name: machine.name, location: machine.location },
    current: collectionCurrent(machine),
    historic: number(machine.telemetry.totalHistoric),
    totalCollected: collectionsTotal(machine),
    collections: [...machine.collections].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  });
});

app.post('/api/machines/:id/collections', requireAdmin, (req, res) => {
  const machine = getMachine(req.params.id);
  if (!machine) return res.status(404).json({ ok: false, error: 'MÃ¡quina no encontrada' });
  if (!requireActionPin(req.body?.pin)) {
    return res.status(403).json({ ok: false, error: 'CÃ³digo de confirmaciÃ³n incorrecto' });
  }

  const historic = number(machine.telemetry.totalHistoric);
  const amount = collectionCurrent(machine);
  const record = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    amount,
    historicAtCollection: historic,
    todayAtCollection: number(machine.telemetry.totalToday),
    monthAtCollection: number(machine.telemetry.totalMonth),
    totalIn1AtCollection: number(machine.telemetry.totalIn1),
    totalIn2AtCollection: number(machine.telemetry.totalIn2)
  };

  machine.collections.push(record);
  machine.collections = machine.collections.slice(-500);
  machine.collectionBaseHistoric = historic;
  machine.events.unshift({
    id: crypto.randomUUID(),
    at: record.at,
    type: 'collection',
    message: `RecaudaciÃ³n registrada: $${amount.toLocaleString('es-CL')}`
  });
  machine.events = machine.events.slice(0, 100);
  saveStore(store);

  res.status(201).json({ ok: true, collection: record, current: 0 });
});

app.post('/api/device/telemetry', requireDeviceKey, (req, res) => {
  const { machineId, machineName, location, telemetry, event } = req.body || {};
  if (!machineId || !telemetry || typeof telemetry !== 'object') {
    return res.status(400).json({ ok: false, error: 'machineId y telemetry son obligatorios' });
  }

  const machine = ensureMachine(String(machineId), machineName || String(machineId));
  machine.name = machineName || machine.name;
  if (location) machine.location = String(location);
  machine.updatedAt = new Date().toISOString();
  machine.telemetry = { ...machine.telemetry, ...telemetry };

  if (event && typeof event === 'object') {
    machine.events.unshift({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      type: String(event.type || 'info'),
      message: String(event.message || '')
    });
    machine.events = machine.events.slice(0, 100);
  }

  saveStore(store);
  res.json({ ok: true, serverTime: machine.updatedAt });
});

app.post('/api/machines/:id/commands', requireAdmin, (req, res) => {
  const machine = getMachine(req.params.id);
  if (!machine) return res.status(404).json({ ok: false, error: 'MÃ¡quina no encontrada' });

  const allowed = new Set([
    'pay', 'reset_error', 'enable_acceptors', 'hopper_manual', 'set_volume',
    'next_song', 'set_mute', 'play_voice', 'change_wifi', 'restart_esp'
  ]);
  const { type, payload = {} } = req.body || {};
  if (!allowed.has(type)) return res.status(400).json({ ok: false, error: 'Comando no permitido' });

  if (type === 'pay') {
    if (!requireActionPin(payload.confirmationCode)) {
      return res.status(403).json({ ok: false, error: 'CÃ³digo de confirmaciÃ³n incorrecto. Pago cancelado.' });
    }
    const amount = Number(payload.amount);
    if (!Number.isInteger(amount) || amount < 100 || amount > 20000 || amount % 100 !== 0) {
      return res.status(400).json({ ok: false, error: 'El pago debe ser mÃºltiplo de $100 entre $100 y $20.000' });
    }
    if (![1, 2].includes(Number(payload.changer))) {
      return res.status(400).json({ ok: false, error: 'Cambiador invÃ¡lido' });
    }
  }

  const command = {
    id: crypto.randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString(),
    status: 'pending'
  };
  machine.commands.push(command);
  machine.events.unshift({
    id: crypto.randomUUID(),
    at: command.createdAt,
    type: 'command',
    message: `Comando enviado: ${type}`
  });
  machine.events = machine.events.slice(0, 100);
  saveStore(store);
  res.status(201).json({ ok: true, command });
});

app.get('/api/device/:id/commands/next', requireDeviceKey, (req, res) => {
  const machine = getMachine(req.params.id);
  if (!machine) return res.status(404).json({ ok: false, error: 'MÃ¡quina no encontrada' });
  const command = machine.commands.find(item => item.status === 'pending') || null;
  res.json({ ok: true, command });
});

app.post('/api/device/:id/commands/:commandId/ack', requireDeviceKey, (req, res) => {
  const machine = getMachine(req.params.id);
  if (!machine) return res.status(404).json({ ok: false, error: 'MÃ¡quina no encontrada' });
  const command = machine.commands.find(item => item.id === req.params.commandId);
  if (!command) return res.status(404).json({ ok: false, error: 'Comando no encontrado' });
  command.status = req.body?.ok === false ? 'failed' : 'done';
  command.result = String(req.body?.result || '');
  command.completedAt = new Date().toISOString();
  saveStore(store);
  res.json({ ok: true });
});

app.use((req, res, next) => {
  if (req.method === 'GET') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DGL Cloud funcionando en puerto ${PORT}`);
});
