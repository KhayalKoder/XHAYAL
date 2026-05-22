# 🎰 TEXAS HOLD'EM POKER — Premium Node.js Edition

**Premium 3D Texas Hold'em poker oyunu**
- ⚡ Backend: Node.js + Express + Socket.IO
- 🎨 Frontend: HTML + CSS + JavaScript (premium 3D dizayn)
- 💾 Database: SQLite (persistent player accounts)
- 🏆 Leaderboard və oyunçu statistikası
- ⏱️ 30 saniyə auto-start interval

---

## 📦 QURAŞDIRMA

### 1. Node.js install edilmiş olmalıdır (v18+)
```bash
node --version
```
Yoxdursa: https://nodejs.org

### 2. Paketləri yüklə
```bash
npm install
# və ya
yarn install
```

### 3. Serveri işə sal
```bash
npm start
# və ya
node server.js
```

### 4. Brauzerdə aç
```
http://localhost:8080
```

Port-u dəyişmək üçün:
```bash
PORT=3000 node server.js
```

---

## 🏗️ LAYIHƏ STRUKTURU

```
poker-premium/
├── server.js              # Əsas Express + Socket.IO server
├── package.json           # Node.js asılılıqları
├── README.md              # Bu fayl
│
├── src/
│   ├── constants.js       # Stake tier-lər, avatarlar, konfiqurasiya
│   ├── cards.js           # Kart dəstəsi və hand evaluation
│   ├── gameRoom.js        # Bir masanın tam state machine-i
│   ├── lobby.js           # Lobby & broadcast helpers
│   ├── events.js          # Socket.IO event handlers
│   └── db.js              # SQLite database (better-sqlite3)
│
├── static/
│   ├── index.html         # Premium 3D web UI
│   ├── styles.css         # 3D effektlər, glow animasiya
│   └── app.js             # Frontend logic + Socket.IO klienti
│
└── data/
    └── poker.db           # SQLite DB (avtomatik yaradılır)
```

---

## ✨ XÜSUSIYYƏTLƏR

### 🎮 Oyun Funksionallığı
- ✅ Real-time multiplayer Socket.IO ilə
- ✅ Texas Hold'em qaydaları (preflop / flop / turn / river / showdown)
- ✅ 6 stake tier (Micro → Elite)
- ✅ Hər tier-də 2 masa
- ✅ 4-6 oyunçu hər masada
- ✅ 30 saniyə auto-start interval
- ✅ 30 saniyə turn timeout (vaxt keçəndə auto-fold)
- ✅ Fold, Check, Call, Raise, All-In
- ✅ Side pot məntiqi (all-in halları üçün)
- ✅ Split pot (eyni əldə bərabər winners)
- ✅ Spectator mode (oyun gedirsə avto-tamaşaçı)

### 🎨 Premium 3D Dizayn
- ✅ 3D rotateX masa (perspective:1200px)
- ✅ İşıldayan qızıl border (tableGlow animasiya)
- ✅ Premium kart animasiyaları (cubic-bezier deal)
- ✅ Aktiv seat parlama effekti (seatPulse)
- ✅ Glassmorphism shadowlar
- ✅ Premium gradient backgroundlar

### 💾 SQLite Database
- ✅ Persistent player accounts (ad ilə)
- ✅ Chips balansı qorunur (logout → login)
- ✅ Hands played / won statistikası
- ✅ Total winnings tracking
- ✅ Biggest pot rekord
- ✅ Hand history log
- ✅ Auto re-buy (chips bitəndə avtomatik)

### 🏆 Leaderboard
- ✅ Top 20 by chips (sərvət)
- ✅ Top 20 by winnings (qaliblər)
- ✅ Sənin sıralanışın vurğulanır
- ✅ Personal stats panel
- ✅ Win rate % hesablanması

### 💬 Sosial
- ✅ Lobby chat (hamı görür)
- ✅ Table chat (masa daxilində)
- ✅ Sistem mesajları (oyunçu qoşulma/ayrılma)

---

## 🔧 KONFIQURASIYA

`src/constants.js` faylında:

```javascript
const TURN_TIMEOUT = 30;        // Oyunçu növbə vaxtı (saniyə)
const AUTOSTART_WAIT = 30;      // 4+ oyunçu olanda neçə saniyə gözlənilir
const STARTING_CHIPS = 10000;   // Yeni oyunçular üçün başlanğıc chips

const STAKE_TIERS = [
  // Stake-ləri buradan dəyişdirə bilərsiniz
  { id: 'micro', name: 'Micro · 0.20/0.40', sb: 0.20, bb: 0.40, ... },
  ...
];
```

---

## 🌐 API ENDPOINTLƏRİ

### GET `/health`
Server statusu yoxlanışı
```bash
curl http://localhost:8080/health
# → ok
```

### GET `/api/leaderboard?type=chips&limit=20`
Liderlər lövhəsi (chips və ya winnings)
```bash
curl http://localhost:8080/api/leaderboard?type=chips
curl http://localhost:8080/api/leaderboard?type=winnings
```

### GET `/api/stats/:name`
Oyunçunun statistikası
```bash
curl http://localhost:8080/api/stats/Player1
```

---

## 🔌 SOCKET.IO EVENTLƏRİ

### Client → Server
| Event | Data | Description |
|-------|------|-------------|
| `lobby_join` | `{name, avatar}` | Lobbiyə qoşul |
| `lobby_chat` | `{msg}` | Lobby chat mesajı |
| `join_table` | `{room_id, spectate}` | Masaya qoşul |
| `leave_table` | `{}` | Masadan çıx |
| `player_action` | `{action, amount}` | Oyun hərəkəti |
| `table_chat` | `{msg}` | Masa chat |
| `get_leaderboard` | `{type}` | Liderlər lövhəsini al |
| `get_stats` | `{name}` | Oyunçu statistikasını al |

### Server → Client
| Event | Description |
|-------|-------------|
| `lobby_state` | Lobby snapshot |
| `joined_table` | Masaya qoşulundu |
| `round_started` | Raund başladı |
| `player_acted` | Oyunçu hərəkət etdi |
| `phase_changed` | Faza dəyişdi |
| `hand_over` | El bitdi |
| `showdown` | Showdown |
| `your_profile` | Sizin profil məlumatları |
| `leaderboard_data` | Liderlər |
| `stats_data` | Statistika |
| `error` | Xəta mesajı |

---

## 🚀 PRODUCTION DEPLOYMENT

### Process Manager (PM2) ilə
```bash
npm install -g pm2
pm2 start server.js --name poker
pm2 startup
pm2 save
```

### Docker ilə
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
```

```bash
docker build -t poker-premium .
docker run -p 8080:8080 -v $(pwd)/data:/app/data poker-premium
```

### Nginx reverse proxy
```nginx
location / {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

---

## 🐛 DEBUG

### Logları izlə
```bash
node server.js | tee poker.log
```

### Database-i sıfırla
```bash
rm data/poker.db
node server.js
```

### Database-i yoxla
```bash
sqlite3 data/poker.db
> SELECT * FROM players ORDER BY chips DESC LIMIT 10;
> SELECT * FROM hand_history ORDER BY played_at DESC LIMIT 20;
```

---

## 🎯 TEST

Server işə salındıqdan sonra:
1. Brauzerdə `http://localhost:8080` aç
2. Adınızı və avatar seçin
3. Lobbiyə daxil olun
4. Stake seçin (Micro tier rahat başlanğıc üçün)
5. Masaya daxil olun
6. **4 fərqli brauzer pəncərəsində** eyni şeyi edin (oyunçular)
7. 4 oyunçu toplandıqda 30 saniyə sayım başlayır
8. Oyun avtomatik başlayır 🎰

---

## 📝 LİSENZİYA

MIT License

---

## 🎰 Uğurlar!

Premium poker tətbiqiniz hazırdır! Suallar olarsa, GitHub issue açın və ya əlaqə saxlayın.
