const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// HiveMQ public broker
const MQTT_BROKER   = 'mqtt://broker.hivemq.com';
const TOPIC_COMMAND = 'warehouse/rack/command';
const TOPIC_STATUS  = 'warehouse/rack/status';

// In-memory data
const warehouses = {
  "WH001": { name: "Warehouse 1", esp32Ip: "192.168.4.1", status: "offline", activeRack: null },
};

const scanHistory = []; // last 100 scans
const MAX_HISTORY = 100;

// Connect to MQTT broker
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
    // ESP32 online/offline status
    if (msg === 'ESP32 online') {
  // Only mark WH001 online since that's the only ESP32
  if (warehouses['WH001']) warehouses['WH001'].status = 'online';
}
if (msg.startsWith('LED ON:')) {
  const rack = msg.replace('LED ON: ', '').trim();
  if (warehouses['WH001']) warehouses['WH001'].activeRack = rack;
}
if (msg === 'LED off') {
  if (warehouses['WH001']) warehouses['WH001'].activeRack = null;
}}
});

mqttClient.on('error', (err) => {
  console.log('MQTT error:', err.message);
});

// -------------------------
// POST /api/light
// Body: { warehouse_id, rack, product_name, barcode }
// -------------------------
app.post('/api/light', (req, res) => {
  const { warehouse_id, rack, product_name, barcode } = req.body;

  if (!warehouse_id || !rack) {
    return res.status(400).json({ success: false, message: 'Missing warehouse_id or rack' });
  }

  const validRacks = ['RackA', 'RackB', 'RackC'];
  if (!validRacks.includes(rack)) {
    return res.status(400).json({ success: false, message: `Invalid rack: ${rack}` });
  }

  // Publish MQTT
  const message = `${warehouse_id}:${rack}`;
  mqttClient.publish(TOPIC_COMMAND, message);

  // Save to history
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

  // Update active rack
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
    activeRack: data.activeRack
  }));
  res.json({ success: true, warehouses: list });
});

// -------------------------
// POST /api/warehouses
// Add warehouse
// -------------------------
app.post('/api/warehouses', (req, res) => {
  const { id, name, esp32Ip } = req.body;
  if (!id || !name || !esp32Ip) {
    return res.status(400).json({ success: false, message: 'Missing id, name or esp32Ip' });
  }
  warehouses[id] = { name, esp32Ip, status: 'offline', activeRack: null };
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