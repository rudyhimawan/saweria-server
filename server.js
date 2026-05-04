const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// =============================================
// SAWERIA WEBHOOK ENDPOINT
// Di dashboard Saweria, set webhook URL ke:
// https://your-server.com/webhook/saweria
// =============================================
app.post('/webhook/saweria', (req, res) => {
  const data = req.body;
  console.log('Donasi masuk dari Saweria:', data);

  // Format data dari Saweria
  // Field dari Saweria: donator_name, amount, message, created_at
  const donation = {
    id: Date.now(),
    name: data.donator_name || 'Anonymous',
    amount: parseInt(data.amount) || 0,
    message: data.message || '',
    time: data.created_at || new Date().toISOString()
  };

  // Simpan ke history
  donationHistory.unshift(donation);
  if (donationHistory.length > 100) donationHistory.pop();

  // Update leaderboard
  updateLeaderboard(donation);

  // Kirim ke semua browser yang connect via WebSocket
  io.emit('new_donation', donation);
  io.emit('leaderboard_update', getLeaderboard());

  res.json({ status: 'ok' });
});

// =============================================
// DATA STORAGE (in-memory, reset kalau server restart)
// Kalau mau permanen, ganti pake database (SQLite/MongoDB)
// =============================================
let donationHistory = [];
let leaderboardMap = {}; // { username: { name, total, count } }

function updateLeaderboard(donation) {
  const key = donation.name.toLowerCase();
  if (!leaderboardMap[key]) {
    leaderboardMap[key] = { name: donation.name, total: 0, count: 0 };
  }
  leaderboardMap[key].total += donation.amount;
  leaderboardMap[key].count += 1;
}

function getLeaderboard() {
  return Object.values(leaderboardMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}

// =============================================
// API ENDPOINTS
// =============================================
app.get('/api/history', (req, res) => {
  res.json(donationHistory);
});

app.get('/api/leaderboard', (req, res) => {
  res.json(getLeaderboard());
});

// Test endpoint — buat simulasi donasi tanpa Saweria
app.post('/api/test-donation', (req, res) => {
  const { name, amount, message } = req.body;
  const donation = {
    id: Date.now(),
    name: name || 'TestUser',
    amount: parseInt(amount) || 10000,
    message: message || 'Test donasi!',
    time: new Date().toISOString()
  };
  donationHistory.unshift(donation);
  updateLeaderboard(donation);
  io.emit('new_donation', donation);
  io.emit('leaderboard_update', getLeaderboard());
  res.json({ status: 'ok', donation });
});

// =============================================
// WEBSOCKET
// =============================================
io.on('connection', (socket) => {
  console.log('Browser connect:', socket.id);
  // Kirim data awal
  socket.emit('history', donationHistory);
  socket.emit('leaderboard_update', getLeaderboard());
  socket.on('disconnect', () => console.log('Browser disconnect:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});
