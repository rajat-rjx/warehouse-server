const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

// Store warehouse ESP32 IPs
// In production this would be a database
const warehouses = {
  "WH001": "192.168.4.1",
  "WH002": "192.168.4.2",
  "WH003": "192.168.4.3"
};

// -------------------------
// POST /api/light
// Body: { warehouse_id, rack }
// Called by company WMS system
// -------------------------
app.post('/api/light', (req, res) => {
  const { warehouse_id, rack } = req.body;

  if (!warehouse_id || !rack) {
    return res.status(400).json({
      success: false,
      message: 'Missing warehouse_id or rack'
    });
  }

  const esp32Ip = warehouses[warehouse_id];
  if (!esp32Ip) {
    return res.status(404).json({
      success: false,
      message: `Warehouse ${warehouse_id} not found`
    });
  }

  // Send command to ESP32
  const url = `http://${esp32Ip}/rack?name=${rack}`;
  http.get(url, (esp32Res) => {
    let data = '';
    esp32Res.on('data', chunk => data += chunk);
    esp32Res.on('end', () => {
      console.log(`[OK] ${warehouse_id} → ${rack} → ${esp32Ip}`);
      res.json({
        success: true,
        warehouse: warehouse_id,
        rack: rack,
        esp32: esp32Ip,
        response: data
      });
    });
  }).on('error', (err) => {
    console.log(`[ERROR] Cannot reach ESP32 at ${esp32Ip}`);
    res.status(500).json({
      success: false,
      message: `Cannot reach ESP32: ${err.message}`
    });
  });
});

// -------------------------
// GET /api/warehouses
// Returns all warehouses
// -------------------------
app.get('/api/warehouses', (req, res) => {
  const list = Object.entries(warehouses).map(([id, ip]) => ({
    id,
    esp32Ip: ip
  }));
  res.json({ success: true, warehouses: list });
});

// -------------------------
// POST /api/warehouses
// Add a new warehouse
// Body: { id, esp32Ip }
// -------------------------
app.post('/api/warehouses', (req, res) => {
  const { id, esp32Ip } = req.body;
  if (!id || !esp32Ip) {
    return res.status(400).json({
      success: false,
      message: 'Missing id or esp32Ip'
    });
  }
  warehouses[id] = esp32Ip;
  console.log(`[ADDED] Warehouse ${id} → ${esp32Ip}`);
  res.json({ success: true, message: `Warehouse ${id} added` });
});

// -------------------------
// GET /api/health
// Check if server is running
// -------------------------
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Warehouse server running',
    warehouses: Object.keys(warehouses).length
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('================================');
  console.log('  Warehouse LED Server');
  console.log('================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log('================================');
});