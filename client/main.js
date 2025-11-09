// client/main.js — FINAL FIX with per-user remote stroke tracking
(function () {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  function init() {
    const canvasEl = document.getElementById("draw");
    const cursorsEl = document.getElementById("cursors");
    const toolEl = document.getElementById("tool");
    const colorEl = document.getElementById("color");
    const widthEl = document.getElementById("width");
    const undoBtn = document.getElementById("undo");
    const redoBtn = document.getElementById("redo");
    const userListEl = document.getElementById("user-list");
    const actionsCountEl = document.getElementById("actions-count");
    const roomDisplay = document.getElementById("room-display");
    const myRoomInput = document.getElementById("my-room-id");
    const joinRoomInput = document.getElementById("join-room-id");
    const joinBtn = document.getElementById("join");
    const copyLinkBtn = document.getElementById("copy-link");

    const cc = new CollaborativeCanvas(canvasEl, cursorsEl);
    const { socket, send, on } = window.socketConnect(location.origin);
    const userId = "u-" + Math.random().toString(36).slice(2, 9);
    let userColor = colorEl.value;
    let currentRoom = "room-" + Math.random().toString(36).substring(2, 8);

    // --- handle shared room from URL ---
    const urlParams = new URLSearchParams(window.location.search);
    const sharedRoom = urlParams.get("room");
    if (sharedRoom) currentRoom = sharedRoom;

    myRoomInput.value = currentRoom;
    roomDisplay.textContent = `(${currentRoom})`;

    // remote active strokes map: { userId -> { id, points, color, ... } }
    const remoteActiveStrokes = new Map();

    // --------------- SOCKET CONNECTION ------------------
    socket.on("connect", () => send("join", { room: currentRoom, userId, color: userColor }));

    on("init", (payload) => {
      if (!payload || payload.room !== currentRoom) return;
      cc.actions = [];
      cc.committedIds.clear();
      cc.applyActions(payload.actions || []);
      updateUsers(payload.users || []);
      actionsCountEl.textContent = (payload.actions || []).length;
    });

    // --------------- REMOTE DRAWING HANDLERS ------------------
    on("stroke-start", (action) => {
      if (!action || action.userId === userId) return;
      // new stroke from remote user — store separately
      remoteActiveStrokes.set(action.userId, action);
      cc.redraw();
    });

    on("stroke-patch", ({ id, points }) => {
      // find which remote user is drawing this id
      for (const [uid, stroke] of remoteActiveStrokes.entries()) {
        if (stroke.id === id) {
          stroke.points = (stroke.points || []).concat(points || []);
          cc.redraw();
          return;
        }
      }
    });

    on("stroke-end", (action) => {
      if (!action) return;
      // remove from active map if exists
      remoteActiveStrokes.delete(action.userId);
      // commit to canvas actions
      cc.applyAction(action, { commit: true });
      actionsCountEl.textContent = cc.actions.length;
      cc.redraw();
    });

    on("stroke", (a) => {
      cc.applyAction(a, { commit: true });
      actionsCountEl.textContent = cc.actions.length;
    });

    on("undo", (payload) => {
      if (!payload) return;
      if (payload.action) {
        cc.applyAction(payload.action, { commit: true });
      } else if (payload.id) {
        const i = cc.actions.findIndex((a) => a.id === payload.id);
        if (i !== -1) cc.actions[i].active = false;
      }
      cc.redraw();
      actionsCountEl.textContent = cc.actions.length;
    });

    on("redo", (payload) => {
      if (!payload) return;
      if (payload.action) {
        cc.applyAction(payload.action, { commit: true });
      } else if (payload.id) {
        const i = cc.actions.findIndex((a) => a.id === payload.id);
        if (i !== -1) cc.actions[i].active = true;
      }
      cc.redraw();
      actionsCountEl.textContent = cc.actions.length;
    });

    on("users", updateUsers);
    on("cursor", (c) => {
      if (c && c.room === currentRoom) cc.setRemoteCursor(c.userId, c.x, c.y, c.name, c.color);
    });
    on("user-left", (u) => {
      remoteActiveStrokes.delete(u.userId);
      cc.removeCursor(u.userId);
      cc.redraw();
    });

    // Override redraw to include remote active strokes
    const baseRedraw = cc.redraw.bind(cc);
    cc.redraw = function () {
      baseRedraw();
      const ctx = this.ctx;
      ctx.save();
      for (const stroke of remoteActiveStrokes.values()) {
        this._drawStroke(ctx, stroke);
      }
      ctx.restore();
    };

    // ---------------- DRAWING INPUT HANDLERS ----------------
    function getPos(e) {
      const rect = canvasEl.getBoundingClientRect();
      if (e.touches && e.touches[0]) e = e.touches[0];
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    let lastEmit = 0;
    const emitInterval = 60;
    let moveBuffer = [];
    let lastCursor = 0;
    const cursorInterval = 50;

    function onPointerDown(e) {
      cc.setTool(toolEl.value);
      cc.setColor(colorEl.value);
      cc.setWidth(Number(widthEl.value));

      const p = getPos(e);
      cc.beginStroke(userId, p);
      send("stroke-start", { room: currentRoom, action: cc.currentStroke });
      if (e.pointerId && canvasEl.setPointerCapture) try { canvasEl.setPointerCapture(e.pointerId); } catch {}
    }

    function onPointerMove(e) {
      const p = getPos(e);
      if (cc.isDrawing) {
        cc.addPoint(p);
        moveBuffer.push(p);
      }
      const now = Date.now();
      if (now - lastEmit > emitInterval && moveBuffer.length && cc.currentStroke) {
        const pts = moveBuffer.splice(0, moveBuffer.length);
        send("stroke-patch", { room: currentRoom, id: cc.currentStroke.id, points: pts });
        lastEmit = now;
      }
      if (now - lastCursor > cursorInterval) {
        lastCursor = now;
        send("cursor", { room: currentRoom, userId, x: p.x, y: p.y, color: userColor, name: userId });
      }
    }

    function onPointerUp(e) {
      const s = cc.endStroke();
      if (s) send("stroke-end", { room: currentRoom, action: s });
      if (e.pointerId && canvasEl.releasePointerCapture) try { canvasEl.releasePointerCapture(e.pointerId); } catch {}
    }

    canvasEl.addEventListener("pointerdown", onPointerDown);
    canvasEl.addEventListener("pointermove", onPointerMove);
    canvasEl.addEventListener("pointerup", onPointerUp);
    canvasEl.addEventListener("pointercancel", onPointerUp);
    canvasEl.addEventListener("pointerleave", onPointerUp);

    // ---------------- UI BUTTONS ----------------
    undoBtn.addEventListener("click", () => send("undo", { room: currentRoom }));
    redoBtn.addEventListener("click", () => send("redo", { room: currentRoom }));

    copyLinkBtn.addEventListener("click", () => {
      const url = `${location.origin}?room=${currentRoom}`;
      navigator.clipboard.writeText(url);
      copyLinkBtn.textContent = "✅ Copied!";
      setTimeout(() => (copyLinkBtn.textContent = "🔗 Copy Invite Link"), 2000);
    });

    joinBtn.addEventListener("click", () => {
      const newRoom = joinRoomInput.value.trim() || "lobby";
      if (newRoom === currentRoom) return;
      send("leave", { room: currentRoom, userId });
      currentRoom = newRoom;
      myRoomInput.value = newRoom;
      roomDisplay.textContent = `(${newRoom})`;
      cc.actions = [];
      cc.committedIds.clear();
      remoteActiveStrokes.clear();
      cc.currentStroke = null;
      cc.redrawOffscreen();
      cc.redraw();
      send("join", { room: currentRoom, userId, color: userColor });
    });

    function updateUsers(users) {
      userListEl.innerHTML = "";
      (users || []).forEach((u) => {
        const li = document.createElement("li");
        li.textContent = `${u.userId}${u.userId === userId ? " (you)" : ""}`;
        li.style.color = u.color || "#333";
        userListEl.appendChild(li);
      });
    }
  }
})();
