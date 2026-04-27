const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');

const app = express();
app.use(cors());
app.use(express.json());

// HiveMQ public broker
const MQTT_BROKER = 'mqtt://broker.hivemq.com';
const TOPIC_COMMAND = 'warehouse/rack/command';
const TOPIC_STATUS  = 'warehouse/rack/status';

// Connect to MQTT broker
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
  console.log('MQTT connected to broker');
  mqttClient.subscribe(TOPIC_STATUS);
});

mqttClient.on('message', (topic, message) => {
  console.log(`[MQTT] ${topic}: ${message.toString()}`);
});

mqttClient.on('error', (err) => {
  console.log('MQTT error:', err.message);
});

// -------------------------
// POST /api/light
// Body: { warehouse_id, rack }
// -------------------------
app.post('/api/light', (req, res) => {
  const { warehouse_id, rack } = req.body;

  if (!warehouse_id || !rack) {
    return res.status(400).json({
      success: false,
      message: 'Missing warehouse_id or rack'
    });
  }

  // Valid racks
  const validRacks = ['RackA', 'RackB', 'RackC'];
  if (!validRacks.includes(rack)) {
    return res.status(400).json({
      success: false,
      message: `Invalid rack: ${rack}. Use RackA, RackB or RackC`
    });
  }

  // Publish MQTT message
  // Format: WH001:RackA
  const message = `${warehouse_id}:${rack}`;
  mqttClient.publish(TOPIC_COMMAND, message);

  console.log(`[LIGHT] Published: ${message}`);

  res.json({
    success: true,
    warehouse: warehouse_id,
    rack: rack,
    message: `Command sent to ${warehouse_id} → ${rack}`
  });
});

// -------------------------
// GET /api/health
// -------------------------
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Warehouse server running',
    mqtt: mqttClient.connected ? 'connected' : 'disconnected'
  });
});

// -------------------------
// GET /api/warehouses
// -------------------------
app.get('/api/warehouses', (req, res) => {
  res.json({
    success: true,
    warehouses: [
      { id: 'WH001', name: 'Warehouse 1' },
      { id: 'WH002', name: 'Warehouse 2' },
      { id: 'WH003', name: 'Warehouse 3' }
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('================================');
  console.log('  Warehouse LED Server');
  console.log('================================');
  console.log(`Port     : ${PORT}`);
  console.log(`MQTT     : ${MQTT_BROKER}`);
  console.log(`Topic    : ${TOPIC_COMMAND}`);
  console.log('================================');
});