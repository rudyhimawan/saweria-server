const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors   = require('cors');
const path   = require('path');
const { Pool } = require('pg');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// =============================================
// POSTGRESQL - otomatis pakai DATABASE_URL dari Railway
// =============================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // wajib di Railway
});

// Buat tabel kalau belum ada (auto-migrate saat startup)
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS donations (
      id         BIGSERIAL PRIMARY KEY,
      name       TEXT        NOT NULL,
      amount     BIGINT      NOT NULL DEFAULT 0,
      message    TEXT        NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      name       TEXT    PRIMARY KEY,
      total      BIGINT  NOT NULL DEFAULT 0,
      count      INT     NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('[DB] Tabel siap');
}

// =============================================
// PARSE AMOUNT
// =============================================
function parseAmount(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return Math.floor(raw);
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[Rp\s]/gi, '').replace(/\./g, '').replace(/,/g, '');
    const result  = parseInt(cleaned, 10);
    return isNaN(result) ? 0 : result;
  }
  return 0;
}

// =============================================
// DB HELPERS
// =============================================

async function saveDonation(donation) {
  const res = await pool.query(
    `INSERT INTO donations (name, amount, message, created_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [donation.name, donation.amount, donation.message, donation.time]
  );
  return res.rows[0].id;
}

// Upsert: kalau nama sudah ada → tambah totalnya, bukan overwrite
async function upsertLeaderboard(name, amount) {
  await pool.query(
    `INSERT INTO leaderboard (name, total, count, updated_at)
     VALUES ($1, $2, 1, NOW())
     ON CONFLICT (name) DO UPDATE
       SET total      = leaderboard.total + $2,
           count      = leaderboard.count + 1,
           updated_at = NOW()`,
    [name.toLowerCase().trim(), amount]
  );
}

async function getLeaderboardFromDB() {
  const res = await pool.query(
    `SELECT name, total, count FROM leaderboard
     ORDER BY total DESC LIMIT 50`
  );
  return res.rows;
}

async function getHistoryFromDB() {
  const res = await pool.query(
    `SELECT id, name, amount, message, created_at AS time
     FROM donations
     ORDER BY id DESC LIMIT 100`
  );
  return res.rows;
}

// Top donatur Saweria HARI INI (WIB), digroup per nama
async function getSaweriaTodayFromDB() {
  const res = await pool.query(
    `SELECT name, SUM(amount)::bigint AS total
     FROM donations
     WHERE (created_at AT TIME ZONE 'Asia/Jakarta')::date
         = (NOW()      AT TIME ZONE 'Asia/Jakarta')::date
     GROUP BY name
     ORDER BY total DESC
     LIMIT 10`
  );
  return res.rows;
}

// =============================================
// SAWERIA WEBHOOK
// POST /webhook/saweria
// =============================================
app.post('/webhook/saweria', async (req, res) => {
  const data = req.body;
  console.log('[Webhook] Raw payload:', JSON.stringify(data));

  const rawAmount = data.amount ?? data.amount_raw ?? data.net_amount ?? 0;
  const amount    = parseAmount(rawAmount);

  const donation = {
    name:    (data.donator_name || data.username || data.fullname || 'Anonymous').trim(),
    amount:  amount,
    message: (data.message || '').trim(),
    time:    data.created_at || new Date().toISOString(),
  };

  console.log(`[Webhook] Parsed: ${donation.name} | Rp${donation.amount} | "${donation.message}"`);

  try {
    const dbId = await saveDonation(donation);
    donation.id = Number(dbId);

    if (amount > 0) {
      await upsertLeaderboard(donation.name, amount);
    }

    const [history, leaderboard] = await Promise.all([
      getHistoryFromDB(),
      getLeaderboardFromDB(),
    ]);

    io.emit('new_donation', donation);
    io.emit('leaderboard_update', leaderboard);

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[Webhook] DB error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =============================================
// API ENDPOINTS
// =============================================
app.get('/api/history', async (req, res) => {
  try {
    const rows = await getHistoryFromDB();
    res.json(rows);
  } catch (err) {
    console.error('[History] DB error:', err.message);
    res.status(500).json([]);
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    res.json(await getLeaderboardFromDB());
  } catch (err) {
    console.error('[Leaderboard] DB error:', err.message);
    res.status(500).json([]);
  }
});

app.get('/api/saweria/today', async (req, res) => {
  try {
    res.json(await getSaweriaTodayFromDB());
  } catch (err) {
    console.error('[SaweriaToday] DB error:', err.message);
    res.status(500).json([]);
  }
});

// Test donation - TIDAK masuk DB, TIDAK masuk leaderboard, TIDAK dikirim ke Roblox
// Hanya untuk preview tampilan overlay/alert di browser saja
app.post('/api/test-donation', (req, res) => {
  const amount = parseAmount(req.body.amount ?? 10000);
  const donation = {
    id:      Date.now(),
    name:    (req.body.name    || 'TestUser').trim(),
    amount:  amount,
    message: (req.body.message || 'Test donasi!').trim(),
    time:    new Date().toISOString(),
    is_test: true, // flag penanda ini cuma test
  };

  // Emit hanya ke browser overlay (untuk preview), tidak ke Roblox
  io.emit('test_donation', donation);

  console.log(`[Test] PREVIEW ONLY - ${donation.name} | Rp${donation.amount}`);
  res.json({ status: 'ok', donation });
});

// Clear semua data
app.post('/api/clear', async (req, res) => {
  try {
    await pool.query('TRUNCATE donations, leaderboard');
    io.emit('leaderboard_update', []);
    io.emit('history', []);
    console.log('[Clear] Semua data di-reset');
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[Clear] DB error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =============================================
// SOCKET.IO
// =============================================
io.on('connection', async (socket) => {
  console.log('[Socket] Browser connect:', socket.id);
  try {
    const [history, leaderboard] = await Promise.all([
      getHistoryFromDB(),
      getLeaderboardFromDB(),
    ]);
    socket.emit('history', history);
    socket.emit('leaderboard_update', leaderboard);
  } catch (err) {
    console.error('[Socket] DB error on connect:', err.message);
  }
  socket.on('disconnect', () => console.log('[Socket] Browser disconnect:', socket.id));
});

// =============================================
// START - init DB dulu baru listen
// =============================================
const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`[Server] Jalan di port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('[DB] Gagal connect ke database:', err.message);
    process.exit(1);
  });
