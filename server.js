const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MQTT_BROKER   = 'mqtt://broker.hivemq.com';
const TOPIC_COMMAND = 'warehouse/rack/command';
const TOPIC_STATUS  = 'warehouse/rack/status';

const warehouses = {
  "WH001": {
    name: "Warehouse 1",
    esp32Ip: "192.168.4.1",
    status: "offline",
    activeRack: null,
    lastSeen: null
  }
};

const scanHistory = [];
const MAX_HISTORY = 100;

// MQTT connect
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
  console.log('MQTT connected');
  mqttClient.subscribe(TOPIC_STATUS);
  mqttClient.subscribe(TOPIC_COMMAND);
});

mqttClient.on('message', (topic, message) => {
  const msg = message.toString();
  console.log(`[MQTT] ${topic}: ${msg}`);

  if (topic === TOPIC_STATUS) {
    if (
      msg === 'ESP32 online' ||
      msg === 'LED off' ||
      msg.startsWith('LED ON:')
    ) {
      warehouses['WH001'].status   = 'online';
      warehouses['WH001'].lastSeen = Date.now();
    }

    if (msg.startsWith('LED ON:')) {
      const rack = msg.replace('LED ON: ', '').trim();
      warehouses['WH001'].activeRack = rack;
    }

    if (msg === 'LED off') {
      warehouses['WH001'].activeRack = null;
    }
  }
});

mqttClient.on('error', (err) => {
  console.log('MQTT error:', err.message);
});

// Check offline every 5 seconds
// If no heartbeat for 15 seconds → mark offline
setInterval(() => {
  const now = Date.now();
  Object.keys(warehouses).forEach(id => {
    const w = warehouses[id];
    if (w.lastSeen && now - w.lastSeen > 15000) {
      if (w.status !== 'offline') {
        console.log(`[OFFLINE] ${id} went offline`);
      }
      w.status     = 'offline';
      w.activeRack = null;
    }
    // Never seen = offline
    if (!w.lastSeen) {
      w.status = 'offline';
    }
  });
}, 5000);

// -------------------------
// POST /api/light
// -------------------------
app.post('/api/light', (req, res) => {
  const { warehouse_id, rack, product_name, barcode } = req.body;

  if (!warehouse_id || !rack) {
    return res.status(400).json({
      success: false,
      message: 'Missing warehouse_id or rack'
    });
  }

  const validRacks = ['RackA', 'RackB', 'RackC'];
  if (!validRacks.includes(rack)) {
    return res.status(400).json({
      success: false,
      message: `Invalid rack: ${rack}`
    });
  }

  const message = `${warehouse_id}:${rack}`;
  mqttClient.publish(TOPIC_COMMAND, message);

  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    warehouse_id,
    warehouse_name: warehouses[warehouse_id]?.name || warehouse_id,
    rack,
    product_name: product_name || 'Unknown',
    barcode: barcode || 'Unknown'
  };
  scanHistory.unshift(entry);
  if (scanHistory.length > MAX_HISTORY) scanHistory.pop();

  if (warehouses[warehouse_id]) {
    warehouses[warehouse_id].activeRack = rack;
  }

  console.log(`[LIGHT] ${warehouse_id} → ${rack} (${product_name || 'Unknown'})`);

  res.json({
    success: true,
    warehouse: warehouse_id,
    rack,
    message: `Command sent to ${warehouse_id} → ${rack}`
  });
});

// -------------------------
// GET /api/warehouses
// -------------------------
app.get('/api/warehouses', (req, res) => {
  const list = Object.entries(warehouses).map(([id, data]) => ({
    id,
    name: data.name,
    esp32Ip: data.esp32Ip,
    status: data.status,
    activeRack: data.activeRack,
    lastSeen: data.lastSeen
  }));
  res.json({ success: true, warehouses: list });
});

// -------------------------
// POST /api/warehouses
// -------------------------
app.post('/api/warehouses', (req, res) => {
  const { id, name, esp32Ip } = req.body;
  if (!id || !name || !esp32Ip) {
    return res.status(400).json({
      success: false,
      message: 'Missing id, name or esp32Ip'
    });
  }
  warehouses[id] = {
    name,
    esp32Ip,
    status: 'offline',
    activeRack: null,
    lastSeen: null
  };
  res.json({ success: true, message: `Warehouse ${id} added` });
});

// -------------------------
// GET /api/history
// -------------------------
app.get('/api/history', (req, res) => {
  res.json({ success: true, history: scanHistory });
});

// -------------------------
// GET /api/health
// -------------------------
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Warehouse server running',
    mqtt: mqttClient.connected ? 'connected' : 'disconnected',
    warehouses: Object.keys(warehouses).length,
    totalScans: scanHistory.length
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('================================');
  console.log('  Warehouse LED Server');
  console.log('================================');
  console.log(`Port  : ${PORT}`);
  console.log(`MQTT  : ${MQTT_BROKER}`);
  console.log(`Topic : ${TOPIC_COMMAND}`);
  console.log('================================');
});