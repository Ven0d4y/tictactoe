# 🎮 TicTac — Real-Time Multiplayer Tic Tac Toe

A clean, modern multiplayer Tic Tac Toe game with real-time WebSocket communication, per-turn timers, scoreboards, and rematch support. No login required.

---

## Project Structure

```
tictactoe/
├── public/
│   └── index.html       # Full frontend (HTML + CSS + JS, single file)
├── server.js            # Node.js + Express + Socket.IO backend
├── package.json
├── vercel.json          # Vercel deployment config
├── .gitignore
└── README.md
```

---

## Features

- ✅ Create/join rooms with unique 6-character IDs
- ✅ Nickname-based identity (no auth)
- ✅ Synced 20-second per-turn countdown timer
- ✅ Opponent wins if you run out of time
- ✅ Win/loss/draw scoreboard per session
- ✅ Rematch system (both players must agree)
- ✅ Winning line animation highlight
- ✅ Web Audio API sound effects (moves, wins, ticks)
- ✅ Copy room link button
- ✅ Auto-fill room ID from URL (`?room=XXXX`)
- ✅ Handles disconnects (opponent gets the win)
- ✅ Responsive — works on mobile and desktop

---

## Running Locally

### Prerequisites
- Node.js v16+ installed

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
# or for development with auto-reload:
npm run dev

# 3. Open in browser
open http://localhost:3000
```

### Playing with a friend
1. Player 1 opens `http://localhost:3000`, enters a nickname, clicks **Create Room**
2. A 6-character room code is shown — share it (or click **Copy** for the full link)
3. Player 2 opens the shared link or goes to `http://localhost:3000`, enters a nickname, pastes the code, clicks **Join Room**
4. Game starts automatically when both players are in the room

---

## Deployment on Vercel

> ⚠️ **Important**: Vercel's serverless functions don't support persistent WebSocket connections. For production use, deploy to a platform that supports long-lived servers.

### Recommended: Railway (free tier, WebSocket-friendly)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Alternative: Render.com

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Set:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
5. Click **Deploy**

### Alternative: Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Deploy
fly launch
fly deploy
```

### If you still want Vercel (with Socket.IO workaround)

Vercel can work with Socket.IO if you configure it to use polling transport only:

```js
// In server.js, change the Socket.IO options:
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["polling"],  // No WebSockets on Vercel
});
```

Then deploy:
```bash
npm install -g vercel
vercel
```

Note: Polling mode works but is less real-time. For best results, use Railway or Render.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | Server port |

---

## Tech Stack

| Layer     | Technology            |
|-----------|-----------------------|
| Frontend  | Vanilla HTML/CSS/JS   |
| Backend   | Node.js + Express     |
| Real-time | Socket.IO v4          |
| Fonts     | Google Fonts (Syne + DM Mono) |
| Audio     | Web Audio API (no files needed) |
