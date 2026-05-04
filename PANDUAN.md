# PANDUAN SETUP SAWERIA LIVE CHAT + LEADERBOARD

## STRUKTUR FILE
```
saweria-server/
├── server.js        ← Backend Node.js (webhook + WebSocket)
├── package.json     ← Dependencies
└── public/
    └── index.html   ← Tampilan Live Chat + Leaderboard
```

---

## STEP 1 — Install Node.js
Download dan install Node.js dari: https://nodejs.org
Pilih versi LTS (yang paling stabil).

---

## STEP 2 — Jalankan Server di Lokal (Testing)
Buka terminal/cmd di folder saweria-server, lalu:
```
npm install
node server.js
```
Buka browser ke: http://localhost:3000
Kalau muncul tampilan Live Chat + Leaderboard = sukses!

---

## STEP 3 — Test Donasi Manual
Tanpa Saweria dulu, bisa test pakai perintah ini di terminal:
```
curl -X POST http://localhost:3000/api/test-donation \
  -H "Content-Type: application/json" \
  -d '{"name":"TestUser","amount":"50000","message":"Halo streamer!"}'
```
Atau pakai Postman/Insomnia kalau di Windows.

---

## STEP 4 — Deploy ke Internet (Railway — GRATIS)

1. Daftar di https://railway.app (pakai akun GitHub)
2. Klik "New Project" → "Deploy from GitHub repo"
3. Upload folder saweria-server ke GitHub dulu, lalu connect
4. Railway otomatis detect Node.js dan deploy
5. Kamu dapat URL seperti: https://saweria-server-xxxx.railway.app

Alternatif gratis lain: Render.com, Cyclic.sh

---

## STEP 5 — Setup Webhook di Saweria

1. Login ke https://saweria.co
2. Masuk ke Dashboard → Settings → Webhook
3. Isi URL webhook dengan:
   https://your-server.railway.app/webhook/saweria
4. Save

Setiap ada yang donate, Saweria akan otomatis kirim data ke server kamu!

---

## STEP 6 — Update URL di index.html

Buka file public/index.html, cari baris ini:
```javascript
const SERVER_URL = 'http://localhost:3000';
```
Ganti dengan URL Railway kamu:
```javascript
const SERVER_URL = 'https://your-server.railway.app';
```

---

## STEP 7 — Pakai di Stream / OBS

Buka index.html di browser (atau tambahkan sebagai Browser Source di OBS):
- URL: https://your-server.railway.app
- Width: 1280, Height: 400 (sesuaikan)

---

## FORMAT DATA DARI SAWERIA
Saweria mengirim data webhook seperti ini:
```json
{
  "donator_name": "NamaUser",
  "amount": "50000",
  "message": "Pesan dari donatur",
  "created_at": "2024-01-01T12:00:00Z"
}
```

---

## CATATAN
- Data donasi hilang kalau server restart (in-memory)
- Kalau mau permanen, tambahkan database SQLite atau MongoDB
- Username Roblox harus sama dengan nama Saweria biar nyambung

---

## TROUBLESHOOTING
- Status "TERPUTUS" → pastikan server.js jalan dan SERVER_URL benar
- Webhook tidak masuk → cek URL webhook di dashboard Saweria
- Port sudah dipakai → ganti PORT di server.js
