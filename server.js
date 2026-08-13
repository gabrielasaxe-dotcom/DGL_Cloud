"use strict";

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DEVICE_API_KEY = process.env.DGL_DEVICE_API_KEY || "CAMBIA-ESTA-CLAVE-DGL";
const ADMIN_KEY = process.env.DGL_ADMIN_KEY || "DGL-ADMIN-CHANGE-ME";
const ACTION_PIN = process.env.DGL_ACTION_PIN || "2324";
const DATA_FILE = process.env.DGL_DATA_FILE || path.join(__dirname, "data", "store.json");

app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

function blankTelemetry() {
  return {
    totalToday: 0, totalWeek: 0, totalMonth: 0, totalHistoric: 0,
    totalIn1: 0, totalIn2: 0, totalOut1: 0, totalOut2: 0,
    pending1: 0, pending2: 0, state1: "SIN DATOS", state2: "SIN DATOS",
    wifiRssi: -100, audioVolume: 22, muted: false,
    error1: false, error2: false, acceptors1: true, acceptors2: true,
    song: 0, voice: 0, uptimeSeconds: 0
  };
}

function seedMachine(id, name, location) {
  return {
    id, name, location, updatedAt: null, telemetry: blankTelemetry(),
    events: [], commands: [], collectionBaselineHistoric: 0,
    collectionBaselineAt: null, collections: []
  };
}

function initialStore() {
  return {
    version: 3,
    machines: {
      "DGL-01": seedMachine("DGL-01", "Cascada Galería Esmeralda", "Galería Esmeralda, Los Andes"),
      "DGL-02": seedMachine("DGL-02", "Cascada Boulevard", "Boulevard Prat, San Felipe")
    }
  };
}

function normalizeMachine(machine) {
  machine.telemetry = { ...blankTelemetry(), ...(machine.telemetry || {}) };
  machine.events = Array.isArray(machine.events) ? machine.events : [];
  machine.commands = Array.isArray(machine.commands) ? machine.commands : [];
  machine.collections = Array.isArray(machine.collections) ? machine.collections : [];
  machine.collectionBaselineHistoric = Number(machine.collectionBaselineHistoric || 0);
  machine.collectionBaselineAt = machine.collectionBaselineAt || null;
  machine.location = machine.location || "";
  machine.name = machine.name || machine.id;
  return machine;
}

function normalizeStore(value) {
  const fallback = initialStore();
  const s = value && typeof value === "object" ? value : fallback;
  s.version = 3;
  s.machines = s.machines && typeof s.machines === "object" ? s.machines : {};
  for (const [id, machine] of Object.entries(s.machines)) {
    machine.id = machine.id || id;
    normalizeMachine(machine);
  }
  for (const [id, machine] of Object.entries(fallback.machines)) {
    if (!s.machines[id]) s.machines[id] = machine;
  }
  return s;
}

function saveStore(s) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function loadStore() {
  try { return normalizeStore(JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))); }
  catch (_) { const s = initialStore(); saveStore(s); return s; }
}

let store = loadStore();

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function requireDeviceKey(req, res, next) {
  if (!safeEqual(req.get("x-api-key"), DEVICE_API_KEY)) {
    return res.status(401).json({ ok: false, error: "API key de dispositivo inválida" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!safeEqual(req.get("x-admin-key"), ADMIN_KEY)) {
    return res.status(401).json({ ok: false, error: "Clave de administrador incorrecta" });
  }
  next();
}

function requireActionPin(pin) { return safeEqual(pin, ACTION_PIN); }
function getMachine(id) { return store.machines[id] || null; }
function ensureMachine(id, name = id) {
  if (!store.machines[id]) store.machines[id] = seedMachine(id, name, "");
  return normalizeMachine(store.machines[id]);
}
function isOnline(machine) {
  const lastSeen = machine.updatedAt ? Date.parse(machine.updatedAt) : 0;
  return Boolean(lastSeen && Date.now() - lastSeen < 15000);
}
function currentCollectionAmount(machine) {
  const historic = Number(machine.telemetry?.totalHistoric || 0);
  const baseline = Number(machine.collectionBaselineHistoric || 0);
  return historic >= baseline ? historic - baseline : historic;
}
function collectionsTotal(machine) {
  return machine.collections.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}
function publicMachine(machine, includeSensitive = false) {
  const result = {
    id: machine.id, name: machine.name, location: machine.location,
    updatedAt: machine.updatedAt, online: isOnline(machine),
    telemetry: { ...(machine.telemetry || {}) },
    collectionCurrent: currentCollectionAmount(machine),
    collectionSince: machine.collectionBaselineAt,
    collectionsCount: machine.collections.length,
    collectionsTotal: collectionsTotal(machine),
    events: machine.events.slice(0, 100)
  };
  if (!includeSensitive) delete result.telemetry.totalHistoric;
  return result;
}
function addEvent(machine, type, message) {
  machine.events.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), type, message });
  machine.events = machine.events.slice(0, 120);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "Devine Golden Luck Cloud", now: new Date().toISOString() });
});

app.post("/api/login", (req, res) => {
  if (!safeEqual(req.body?.key, ADMIN_KEY)) return res.status(401).json({ ok: false, error: "Clave incorrecta" });
  res.json({ ok: true });
});

app.get("/api/machines", requireAdmin, (_req, res) => {
  const machines = Object.values(store.machines)
    .map(machine => publicMachine(normalizeMachine(machine), false))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  res.json({ ok: true, machines });
});

app.get("/api/machines/:id", requireAdmin, (req, res) => {
  const machine = getMachine(req.params.id);
  if (!machine) return res.status(404).json({ ok: false, error: "Máquina no encontrada" });
  res.json({ ok: true, machine: publicMachine(normalizeMachine(machine), false) });
});

app.get("/api/machines/:id/collections", requireAdmin, (req, res) => {
  const machine = getMachine(req.params.id);
  if (!machine) return res.status(404).json({ ok: false, error: "Máquina no encontrada" });
  normalizeMachine(machine);
  res.json({ ok: true, machine: {
    id: machine.id, name: machine.name, location: machine.location, online: isOnline(machine),
    totalHistoric: Number(machine.telemetry.totalHistoric || 0),
    current: currentCollectionAmount(machine), totalCollected: collectionsTotal(machine),
    count: machine.collections.length, since: machine.collectionBaselineAt,
    collections: machine.collections.slice().reverse()
  }});
});

app.post("/api/machines/:id/collections", requireAdmin, (req, res) => {
  const machine = getMachine(req.params.id);
  if (!machine) return res.status(404).json({ ok: false, error: "Máquina no encontrada" });
  normalizeMachine(machine);
  if (!requireActionPin(req.body?.pin)) return res.status(403).json({ ok: false, error: "Código de confirmación incorrecto" });
  if (!isOnline(machine)) return res.status(409).json({ ok: false, error: "La máquina debe estar ONLINE para registrar una recaudación segura" });

  const historic = Number(machine.telemetry.totalHistoric || 0);
  const amount = currentCollectionAmount(machine);
  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(), at: now, amount, historicAtCollection: historic,
    todayAtCollection: Number(machine.telemetry.totalToday || 0),
    monthAtCollection: Number(machine.telemetry.totalMonth || 0),
    note: String(req.body?.note || "").slice(0, 180)
  };
  machine.collections.push(record);
  machine.collectionBaselineHistoric = historic;
  machine.collectionBaselineAt = now;
  addEvent(machine, "collection", `Recaudación registrada: $${amount.toLocaleString("es-CL")}`);
  saveStore(store);
  res.status(201).json({ ok: true, collection: record, current: 0 });
});

app.post("/api/device/telemetry", requireDeviceKey, (req, res) => {
  const { machineId, machineName, location, telemetry, event } = req.body || {};
  if (!machineId || !telemetry || typeof telemetry !== "object") {
    return res.status(400).json({ ok: false, error: "machineId y telemetry son obligatorios" });
  }
  const machine = ensureMachine(String(machineId), machineName || String(machineId));
  machine.name = machineName || machine.name;
  if (location) machine.location = String(location);
  machine.updatedAt = new Date().toISOString();
  machine.telemetry = { ...machine.telemetry, ...telemetry };
  if (event && typeof event === "object") addEvent(machine, String(event.type || "info"), String(event.message || ""));
  saveStore(store);
  res.json({ ok: true, serverTime: machine.updatedAt });
});

app.post("/api/machines/:id/commands", requireAdmin, (req, res) => {
  const machine = getMachine(req.params.id);
  if (!machine) return res.status(404).json({ ok: false, error: "Máquina no encontrada" });
  normalizeMachine(machine);
  const allowed = new Set(["pay","reset_error","enable_acceptors","hopper_manual","set_volume","next_song","set_mute","play_voice","change_wifi","restart_esp"]);
  const { type, payload = {} } = req.body || {};
  if (!allowed.has(type)) return res.status(400).json({ ok: false, error: "Comando no permitido" });
  if (!isOnline(machine)) return res.status(409).json({ ok: false, error: "La máquina está OFFLINE" });

  if (type === "pay") {
    if (!requireActionPin(payload.confirmationCode)) return res.status(403).json({ ok: false, error: "Código 2324 requerido para pagos remotos" });
    const amount = Number(payload.amount);
    if (!Number.isInteger(amount) || amount < 100 || amount > 20000 || amount % 100 !== 0) {
      return res.status(400).json({ ok: false, error: "El pago debe ser múltiplo de $100 entre $100 y $20.000" });
    }
    if (![1, 2].includes(Number(payload.changer))) return res.status(400).json({ ok: false, error: "Cambiador inválido" });
  }

  const command = { id: crypto.randomUUID(), type, payload, createdAt: new Date().toISOString(), status: "pending" };
  machine.commands.push(command);
  machine.commands = machine.commands.slice(-300);
  addEvent(machine, "command", `Comando enviado: ${type}`);
  saveStore(store);
  res.status(201).json({ ok: true, command });
});

app.get("/api/device/:id/commands/next", requireDeviceKey, (req, res) => {
  const machine = getMachine(req.params.id);
  if (!machine) return res.status(404).json({ ok: false, error: "Máquina no encontrada" });
  normalizeMachine(machine);
  const command = machine.commands.find(item => item.status === "pending") || null;
  if (command) {
    command.status = "delivered";
    command.deliveredAt = new Date().toISOString();
    saveStore(store);
  }
  res.json({ ok: true, command });
});

app.post("/api/device/:id/commands/:commandId/ack", requireDeviceKey, (req, res) => {
  const machine = getMachine(req.params.id);
  if (!machine) return res.status(404).json({ ok: false, error: "Máquina no encontrada" });
  normalizeMachine(machine);
  const command = machine.commands.find(item => item.id === req.params.commandId);
  if (!command) return res.status(404).json({ ok: false, error: "Comando no encontrado" });
  command.status = req.body?.ok === false ? "failed" : "done";
  command.result = String(req.body?.result || "");
  command.completedAt = new Date().toISOString();
  saveStore(store);
  res.json({ ok: true });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ ok: false, error: "Ruta API no encontrada" });
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => console.log(`Devine Golden Luck Cloud listo en puerto ${PORT}`));
