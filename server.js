const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// =============================================
// STATE
// =============================================
let donationHistory = [];
let leaderboardMap  = {};

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
// SAWERIA WEBHOOK
// =============================================
app.post('/webhook/saweria', (req, res) => {
  const data = req.body;
  console.log('Donasi masuk:', data);

  const donation = {
    id: Date.now(),
    name: data.donator_name || 'Anonymous',
    amount: parseInt(data.amount) || 0,
    message: data.message || '',
    time: data.created_at || new Date().toISOString()
  };

  donationHistory.unshift(donation);
  if (donationHistory.length > 100) donationHistory.pop();
  updateLeaderboard(donation);

  io.emit('new_donation', donation);
  io.emit('leaderboard_update', getLeaderboard());

  res.json({ status: 'ok' });
});

// =============================================
// API ENDPOINTS
// =============================================
app.get('/api/history', (req, res) => res.json(donationHistory));
app.get('/api/leaderboard', (req, res) => res.json(getLeaderboard()));

// Test donation
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
  if (donationHistory.length > 100) donationHistory.pop();
  updateLeaderboard(donation);
  io.emit('new_donation', donation);
  io.emit('leaderboard_update', getLeaderboard());
  console.log('Test donasi:', donation.name, donation.amount);
  res.json({ status: 'ok', donation });
});

// Clear semua data
app.post('/api/clear', (req, res) => {
  donationHistory = [];
  leaderboardMap  = {};
  io.emit('leaderboard_update', []);
  io.emit('history', []);
  console.log('Data di-clear');
  res.json({ status: 'ok' });
});

// =============================================
// SOCKET.IO
// =============================================
io.on('connection', (socket) => {
  console.log('Browser connect:', socket.id);
  socket.emit('history', donationHistory);
  socket.emit('leaderboard_update', getLeaderboard());
  socket.on('disconnect', () => console.log('Browser disconnect:', socket.id));
});

// =============================================
// START
// =============================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT}`);
});
