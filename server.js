'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DEVICE_API_KEY = process.env.DGL_DEVICE_API_KEY || 'DGL-DISPOSITIVO-CAMBIA-ESTA-CLAVE';
const ADMIN_KEY = process.env.DGL_ADMIN_KEY || 'DGL-ADMIN-CAMBIA-ESTA-CLAVE';
const DATA_FILE = path.join(__dirname, 'data', 'store.json');
const ONLINE_WINDOW_MS = 30000;

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function telemetryBase() {
  return {
    totalToday: 0, totalWeek: 0, totalMonth: 0, totalHistoric: 0,
    totalIn1: 0, totalIn2: 0, totalOut1: 0, totalOut2: 0,
    pending1: 0, pending2: 0, state1: 'SIN DATOS', state2: 'SIN DATOS',
    wifiRssi: -100, audioVolume: 22, muted: false,
    error1: false, error2: false, acceptors1: true, acceptors2: true,
    song: 0, voice: 0, uptimeSeconds: 0
  };
}

function initialStore() {
  return { machines: { 'DGL-01': {
    id: 'DGL-01', name: 'Galería Esmeralda', location: 'Los Andes',
    updatedAt: null, telemetry: telemetryBase(), events: [], commands: []
  } } };
}

function loadStore() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (_) { return initialStore(); }
}

function saveStore() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (error) {
    console.warn('[DGL] Almacenamiento temporal:', error.message);
  }
}

let store = loadStore();

function constantTimeEqual(value, expected) {
  const a = Buffer.from(String(value || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireDevice(req, res, next) {
  if (!constantTimeEqual(req.get('x-api-key'), DEVICE_API_KEY)) {
    return res.status(401).json({ ok: false, error: 'Dispositivo no autorizado' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!constantTimeEqual(req.get('x-admin-key'), ADMIN_KEY)) {
    return res.status(401).json({ ok: false, error: 'Clave de administración incorrecta' });
  }
  next();
}

function ensureMachine(id, name = id) {
  if (!store.machines[id]) {
    store.machines[id] = { id, name, location: '', updatedAt: null,
      telemetry: telemetryBase(), events: [], commands: [] };
  }
  return store.machines[id];
}

function addEvent(machine, type, message) {
  machine.events.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), type, message });
  machine.events = machine.events.slice(0, 150);
}

function publicMachine(machine) {
  const lastSeen = machine.updatedAt ? Date.parse(machine.updatedAt) : 0;
  return { ...machine, online: Boolean(lastSeen && Date.now() - lastSeen < ONLINE_WINDOW_MS), commands: undefined };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'DGL Cloud', now: new Date().toISOString() }));
app.post('/api/login', (req, res) => {
  if (!constantTimeEqual(req.body?.key, ADMIN_KEY)) return res.status(401).json({ ok: false });
  res.json({ ok: true });
});
app.get('/api/machines', requireAdmin, (_req, res) =>
  res.json({ ok: true, machines: Object.values(store.machines).map(publicMachine) }));
app.get('/api/machines/:id', requireAdmin, (req, res) => {
  const machine = store.machines[req.params.id];
  if (!machine) return res.status(404).json({ ok: false, error: 'Máquina no encontrada' });
  res.json({ ok: true, machine: publicMachine(machine) });
});

app.post('/api/device/telemetry', requireDevice, (req, res) => {
  const { machineId, machineName, location, telemetry, event } = req.body || {};
  if (!machineId || !telemetry || typeof telemetry !== 'object') {
    return res.status(400).json({ ok: false, error: 'Faltan datos' });
  }
  const machine = ensureMachine(String(machineId), machineName || String(machineId));
  machine.name = machineName || machine.name;
  machine.location = location || machine.location;
  machine.updatedAt = new Date().toISOString();
  machine.telemetry = { ...machine.telemetry, ...telemetry };
  if (event?.message) addEvent(machine, String(event.type || 'info'), String(event.message));
  saveStore();
  res.json({ ok: true, serverTime: machine.updatedAt });
});

app.post('/api/machines/:id/commands', requireAdmin, (req, res) => {
  const machine = store.machines[req.params.id];
  if (!machine) return res.status(404).json({ ok: false, error: 'Máquina no encontrada' });
  const allowed = new Set(['pay','reset_error','enable_acceptors','hopper_manual','set_volume','next_song','set_mute','play_voice','change_wifi','restart_esp']);
  const { type, payload = {} } = req.body || {};
  if (!allowed.has(type)) return res.status(400).json({ ok: false, error: 'Comando no permitido' });
  if (type === 'pay') {
    const amount = Number(payload.amount), changer = Number(payload.changer);
    if (![1,2].includes(changer) || !Number.isInteger(amount) || amount < 100 || amount > 20000 || amount % 100) {
      return res.status(400).json({ ok: false, error: 'Pago inválido' });
    }
  }
  const command = { id: crypto.randomUUID(), type, payload, createdAt: new Date().toISOString(), status: 'pending' };
  machine.commands.push(command);
  machine.commands = machine.commands.slice(-100);
  addEvent(machine, 'command', `Comando enviado: ${type}`);
  saveStore();
  res.status(201).json({ ok: true, command });
});

app.get('/api/device/:id/commands/next', requireDevice, (req, res) => {
  const machine = ensureMachine(req.params.id);
  const command = machine.commands.find(x => x.status === 'pending') || null;
  res.json({ ok: true, command });
});
app.post('/api/device/:id/commands/:commandId/ack', requireDevice, (req, res) => {
  const machine = ensureMachine(req.params.id);
  const command = machine.commands.find(x => x.id === req.params.commandId);
  if (!command) return res.status(404).json({ ok: false, error: 'Comando no encontrado' });
  command.status = req.body?.ok === false ? 'failed' : 'done';
  command.result = String(req.body?.result || '');
  command.completedAt = new Date().toISOString();
  addEvent(machine, command.status === 'done' ? 'success' : 'error', `${command.type}: ${command.result || command.status}`);
  saveStore();
  res.json({ ok: true });
});

app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'Ruta API no encontrada' }));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`DGL Cloud activo en puerto ${PORT}`));
