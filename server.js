const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(express.static(path.join(__dirname, "public")));

// In-memory rooms store
const rooms = {};

// ─── Helpers ────────────────────────────────────────────────────────────────

function createRoom(roomId) {
  return {
    id: roomId,
    players: [],          // [{ id, nickname, symbol }]
    board: Array(9).fill(null),
    currentTurn: "X",     // whose turn it is
    status: "waiting",    // waiting | playing | finished
    winner: null,         // "X" | "O" | "draw" | null
    scores: {},           // { socketId: { wins, losses, draws } }
    rematchVotes: new Set(),
    timerInterval: null,
    timeLeft: 20,
  };
}

function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6],             // diagonals
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  if (board.every((cell) => cell !== null)) return { winner: "draw", line: [] };
  return null;
}

function broadcastRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const state = {
    id: room.id,
    players: room.players,
    board: room.board,
    currentTurn: room.currentTurn,
    status: room.status,
    winner: room.winner,
    scores: room.scores,
    timeLeft: room.timeLeft,
    rematchVotes: [...room.rematchVotes],
  };
  io.to(roomId).emit("room:state", state);
}

function startTimer(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  clearInterval(room.timerInterval);
  room.timeLeft = 20;

  room.timerInterval = setInterval(() => {
    if (!rooms[roomId]) { clearInterval(room.timerInterval); return; }
    room.timeLeft -= 1;
    io.to(roomId).emit("timer:tick", room.timeLeft);

    if (room.timeLeft <= 0) {
      clearInterval(room.timerInterval);
      // Time out — opponent wins
      const loser = room.currentTurn;
      const winner = loser === "X" ? "O" : "X";
      endGame(roomId, winner, [], "timeout");
    }
  }, 1000);
}

function stopTimer(roomId) {
  const room = rooms[roomId];
  if (room) clearInterval(room.timerInterval);
}

function endGame(roomId, winner, line, reason = "normal") {
  const room = rooms[roomId];
  if (!room) return;
  stopTimer(roomId);
  room.status = "finished";
  room.winner = winner;

  // Update scores
  for (const player of room.players) {
    if (!room.scores[player.id]) room.scores[player.id] = { wins: 0, losses: 0, draws: 0 };
    if (winner === "draw") {
      room.scores[player.id].draws += 1;
    } else if (player.symbol === winner) {
      room.scores[player.id].wins += 1;
    } else {
      room.scores[player.id].losses += 1;
    }
  }

  io.to(roomId).emit("game:over", { winner, line, reason, scores: room.scores });
  broadcastRoom(roomId);
}

// ─── Socket.IO ───────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`[+] ${socket.id} connected`);

  // Create a new room
  socket.on("room:create", ({ nickname }) => {
    if (!nickname || !nickname.trim()) return socket.emit("error", "Nickname required");
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    const room = createRoom(roomId);
    const player = { id: socket.id, nickname: nickname.trim(), symbol: "X" };
    room.players.push(player);
    room.scores[socket.id] = { wins: 0, losses: 0, draws: 0 };
    rooms[roomId] = room;
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.nickname = nickname.trim();
    socket.emit("room:created", { roomId, symbol: "X" });
    broadcastRoom(roomId);
    console.log(`Room ${roomId} created by ${nickname}`);
  });

  // Join an existing room
  socket.on("room:join", ({ roomId, nickname }) => {
    if (!nickname || !nickname.trim()) return socket.emit("error", "Nickname required");
    const room = rooms[roomId?.toUpperCase()];
    if (!room) return socket.emit("error", "Room not found");
    if (room.players.length >= 2) return socket.emit("error", "Room is full");
    if (room.status === "finished") return socket.emit("error", "Game already ended");

    const player = { id: socket.id, nickname: nickname.trim(), symbol: "O" };
    room.players.push(player);
    room.scores[socket.id] = { wins: 0, losses: 0, draws: 0 };
    room.status = "playing";
    socket.join(roomId.toUpperCase());
    socket.data.roomId = roomId.toUpperCase();
    socket.data.nickname = nickname.trim();
    socket.emit("room:joined", { roomId: roomId.toUpperCase(), symbol: "O" });
    io.to(roomId.toUpperCase()).emit("game:start", { players: room.players });
    broadcastRoom(roomId.toUpperCase());
    startTimer(roomId.toUpperCase());
    console.log(`${nickname} joined room ${roomId}`);
  });

  // Make a move
  socket.on("game:move", ({ roomId, index }) => {
    const room = rooms[roomId];
    if (!room || room.status !== "playing") return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;
    if (player.symbol !== room.currentTurn) return socket.emit("error", "Not your turn");
    if (room.board[index] !== null) return socket.emit("error", "Cell taken");

    room.board[index] = player.symbol;
    io.to(roomId).emit("game:move", { index, symbol: player.symbol });

    const result = checkWinner(room.board);
    if (result) {
      endGame(roomId, result.winner, result.line);
    } else {
      room.currentTurn = room.currentTurn === "X" ? "O" : "X";
      broadcastRoom(roomId);
      startTimer(roomId); // reset timer on new turn
    }
  });

  // Rematch vote
  socket.on("game:rematch", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.status !== "finished") return;
    room.rematchVotes.add(socket.id);
    io.to(roomId).emit("rematch:vote", { votes: [...room.rematchVotes], total: room.players.length });

    if (room.rematchVotes.size === room.players.length) {
      // Both agreed — reset board
      room.board = Array(9).fill(null);
      room.currentTurn = "X";
      room.winner = null;
      room.status = "playing";
      room.rematchVotes = new Set();
      io.to(roomId).emit("game:rematch:start", { players: room.players });
      broadcastRoom(roomId);
      startTimer(roomId);
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    const remaining = room.players.filter((p) => p.id !== socket.id);

    if (remaining.length === 0) {
      stopTimer(roomId);
      delete rooms[roomId];
    } else {
      stopTimer(roomId);
      io.to(roomId).emit("player:left", { nickname: socket.data.nickname });
      // Give win to remaining player if game was in progress
      if (room.status === "playing") {
        const winner = remaining[0].symbol;
        endGame(roomId, winner, [], "disconnect");
      }
      // Clean up room after short delay
      setTimeout(() => { delete rooms[roomId]; }, 30000);
    }
    console.log(`[-] ${socket.data.nickname} disconnected from ${roomId}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 Tic Tac Toe running on http://localhost:${PORT}`));
