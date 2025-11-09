const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { rooms, getRoom } = require("./rooms");
const { addAction, lastActiveAction, lastUndoneAction } = require("./drawing-state");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "..", "client")));

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join", ({ room = "lobby", userId, color }) => {
    try {
      const r = getRoom(room);
      socket.join(room);
      r.users.set(userId, { socketId: socket.id, userId, color });
      socket.emit("init", { room, users: Array.from(r.users.values()), actions: r.actions });
      io.to(room).emit("users", Array.from(r.users.values()));
    } catch (err) { console.error("join err", err); }
  });

  socket.on("leave", ({ room = "lobby", userId }) => {
    try {
      const r = getRoom(room);
      r.users.delete(userId);
      socket.leave(room);
      io.to(room).emit("users", Array.from(r.users.values()));
      io.to(room).emit("user-left", { userId });
    } catch (err) { console.error("leave err", err); }
  });

  socket.on("stroke-start", ({ room = "lobby", action }) => {
    try {
      const r = getRoom(room);
      action.ts = action.ts || Date.now();
      addAction(r, action); // add or merge
      io.to(room).emit("stroke-start", action);
    } catch (err) { console.error("stroke-start err", err); }
  });

  socket.on("stroke-patch", ({ room = "lobby", id, points }) => {
    try {
      const r = getRoom(room);
      const a = r.actions.find(x => x.id === id);
      if (a) {
        a.points = (a.points || []).concat(points || []);
      } else {
        // create placeholder action with these points
        r.actions.push({ id, userId: 'remote', tool: 'brush', color: '#000', width: 3, points: points || [], ts: Date.now(), active: true });
      }
      io.to(room).emit("stroke-patch", { id, points });
    } catch (err) { console.error("stroke-patch err", err); }
  });

  socket.on("stroke-end", ({ room = "lobby", action }) => {
    try {
      const r = getRoom(room);
      action.ts = action.ts || Date.now();
      addAction(r, action);
      // server-side commit (authoritative)
      io.to(room).emit("stroke-end", action);
    } catch (err) { console.error("stroke-end err", err); }
  });

  socket.on("stroke", ({ room = "lobby", action }) => {
    try {
      const r = getRoom(room);
      action.ts = action.ts || Date.now();
      addAction(r, action);
      io.to(room).emit("stroke", action);
    } catch (err) { console.error("stroke err", err); }
  });

  socket.on("undo", ({ room = "lobby" }) => {
    try {
      const r = getRoom(room);
      const a = lastActiveAction(r);
      if (!a) return;
      a.active = false;
      io.to(room).emit("undo", { id: a.id, action: a });
    } catch (err) { console.error("undo err", err); }
  });

  socket.on("redo", ({ room = "lobby" }) => {
    try {
      const r = getRoom(room);
      const a = lastUndoneAction(r);
      if (!a) return;
      a.active = true;
      io.to(room).emit("redo", { id: a.id, action: a });
    } catch (err) { console.error("redo err", err); }
  });

  socket.on("cursor", (c) => {
    try {
      if (!c || !c.room) return;
      socket.to(c.room).emit("cursor", c);
    } catch (err) { console.error("cursor err", err); }
  });

  socket.on("disconnect", () => {
    try {
      if (!rooms || typeof rooms.entries !== "function") return;
      for (const [roomId, r] of rooms.entries()) {
        for (const [uid, u] of r.users.entries()) {
          if (u.socketId === socket.id) {
            r.users.delete(uid);
            io.to(roomId).emit("users", Array.from(r.users.values()));
            io.to(roomId).emit("user-left", { userId: uid });
            console.log(`User ${uid} removed from room ${roomId}`);
          }
        }
      }
    } catch (err) { console.error("disconnect err", err); }
  });
});

server.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
