const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

/* ============ In-memory database ============ */
const orders = new Map();

const CONFIG = {
  locations: [
    "NU – Дом студента (Корп. Е)",
    "NU – Столовая (Корп. М)",
    "NU – Библиотека (Корп. А)",
  ],
  menu: [
    { id: "1", name: "Плов с курицей", desc: "Пикантный узбекский плов", price: 1500, category: "Горячее", img: null },
    { id: "2", name: "Греческий салат", desc: "Овощи, сыр фета, оливки", price: 900, category: "Холодное", img: null },
    { id: "3", name: "Эспрессо", desc: "Классический кофе", price: 400, category: "Напитки", img: null },
    { id: "4", name: "Капучино", desc: "Кофе с молочной пеной", price: 550, category: "Напитки", img: null },
    { id: "5", name: "Круассан", desc: "Хрустящий французский", price: 600, category: "Выпечка", img: null },
    { id: "6", name: "Сэндвич Куриный", desc: "Две булки, курица, овощи", price: 1200, category: "Холодное", img: null },
    { id: "7", name: "Лазанья Болоньезе", desc: "Классическая итальянская", price: 2100, category: "Горячее", img: null },
    { id: "8", name: "Фреш апельсин", desc: "Свежевыжатый сок", price: 800, category: "Напитки", img: null },
  ],
  slots: Array.from({ length: 12 }, (_, i) => {
    const hour = 12 + Math.floor(i / 2);
    const minute = (i % 2) * 30;
    return {
      id: `slot_${i}`,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      available: true,
    };
  }),
};

const STAFF_CODES = {
  "1234": { name: "Алмас", location: "NU – Дом студента (Корп. Е)" },
  "5678": { name: "Айнур", location: "NU – Столовая (Корп. М)" },
  "9999": { name: "Ерлан", location: "NU – Библиотека (Корп. А)" },
};

function genOrderId() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const l = letters[Math.floor(Math.random() * letters.length)];
  const n = Math.floor(100 + Math.random() * 900);
  return l + n;
}

/* ============ API Routes ============ */

// GET /api/config - Config
app.get('/api/config', (req, res) => {
  res.json(CONFIG);
});

// POST /api/orders - Create order
app.post('/api/orders', (req, res) => {
  const { location, items, slot, phone } = req.body;
  
  if (!location || !items || !slot) {
    return res.status(400).json({ error: "location, items, slot required" });
  }

  const orderId = genOrderId();
  const now = Date.now();
  const slotObj = CONFIG.slots.find(s => s.id === slot);
  const slotTime = slotObj ? slotObj.time : "12:00";

  const total = items.reduce((sum, item) => {
    const menuItem = CONFIG.menu.find(m => m.id === item.id);
    return sum + (menuItem ? menuItem.price * item.qty : 0);
  }, 0);

  const order = {
    id: orderId,
    location,
    items,
    slot,
    slotTime,
    phone: phone || "",
    status: "paid",
    total,
    createdAt: now,
    readyAt: now + 15 * 60 * 1000,
    acceptedAt: null,
    acceptedBy: null,
    prepMinutes: null,
    zone: null,
    tray: null,
    deliveredAt: null,
    timeline: [
      { step: "paid", completedAt: now },
    ],
  };

  orders.set(orderId, order);
  res.json(order);
});

// GET /api/orders
app.get('/api/orders', (req, res) => {
  const { location } = req.query;
  let result = Array.from(orders.values());
  
  if (location) {
    result = result.filter(o => o.location === location);
  }
  
  res.json(result);
});

// GET /api/orders/:id
app.get('/api/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

// POST /api/orders/:id/accept
app.post('/api/orders/:id/accept', (req, res) => {
  const { minutes, staffName } = req.body;
  const order = orders.get(req.params.id);
  
  if (!order) return res.status(404).json({ error: "Order not found" });
  
  const now = Date.now();
  order.status = "accepted";
  order.acceptedAt = now;
  order.acceptedBy = staffName;
  order.prepMinutes = minutes || 10;
  order.readyAt = now + (minutes || 10) * 60 * 1000;
  order.timeline.push({ step: "accepted", completedAt: now });
  
  res.json(order);
});

// POST /api/orders/:id/load
app.post('/api/orders/:id/load', (req, res) => {
  const { zone, tray, staffName } = req.body;
  const order = orders.get(req.params.id);
  
  if (!order) return res.status(404).json({ error: "Order not found" });
  
  const now = Date.now();
  order.status = "ready";
  order.zone = zone;
  order.tray = tray;
  order.timeline.push({ step: "ready", completedAt: now });
  
  res.json(order);
});

// POST /api/orders/:id/deliver
app.post('/api/orders/:id/deliver', (req, res) => {
  const { by } = req.body;
  const order = orders.get(req.params.id);
  
  if (!order) return res.status(404).json({ error: "Order not found" });
  
  const now = Date.now();
  order.status = "delivered";
  order.deliveredAt = now;
  order.timeline.push({ step: "delivered", completedAt: now });
  
  res.json(order);
});

// POST /api/staff/login
app.post('/api/staff/login', (req, res) => {
  const { code } = req.body;
  const staff = STAFF_CODES[code];
  
  if (!staff) {
    return res.status(401).json({ error: "Invalid code" });
  }
  
  res.json(staff);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🍽️  Bite&Go server running on http://localhost:${PORT}`);
  console.log(`Staff codes: 1234, 5678, 9999`);
});