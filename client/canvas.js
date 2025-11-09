// client/canvas.js
class CollaborativeCanvas {
  constructor(canvasEl, cursorsEl) {
    this.canvas = canvasEl;
    this.cursors = cursorsEl;
    this.ctx = this.canvas.getContext("2d");

    this.offscreen = document.createElement("canvas");
    this.offscreenCtx = this.offscreen.getContext("2d");

    this.dpr = window.devicePixelRatio || 1;

    // actions array holds server/remote and committed strokes only (not local currentStroke)
    this.actions = [];
    this.committedIds = new Set();
    this.currentStroke = null; // local in-progress stroke ONLY
    this.tool = "brush";
    this.color = "#2b2bff";
    this.width = 4;
    this.isDrawing = false;

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.offscreen.width = Math.round(w * this.dpr);
    this.offscreen.height = Math.round(h * this.dpr);
    this.offscreenCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.redrawOffscreen();
    this.redraw();
  }

  // Merge incoming actions (from server). Does NOT commit them until stroke-end event.
  applyActions(actions) {
    if (!actions) return;
    const map = new Map(this.actions.map(a => [a.id, a]));
    for (const a of actions) {
      if (!a || !a.id) continue;
      if (map.has(a.id)) {
        Object.assign(map.get(a.id), a);
      } else {
        this.actions.push(Object.assign({}, a));
      }
    }
    this.redrawOffscreen();
    this.redraw();
  }

  // Add/replace single action (server events)
  applyAction(action, opt = { commit: false }) {
    if (!action || !action.id) return;
    const idx = this.actions.findIndex(a => a.id === action.id);
    if (idx === -1) this.actions.push(Object.assign({}, action));
    else {
      const existing = this.actions[idx];
      const merged = Object.assign({}, existing, action);
      if ((!merged.points || merged.points.length === 0) && existing.points) merged.points = existing.points;
      this.actions[idx] = merged;
    }

    if (opt.commit) {
      this.committedIds.add(action.id);
      this.redrawOffscreen();
    }
    this.redraw();
  }

  // Draw committed actions into offscreen buffer
  redrawOffscreen() {
    const ctx = this.offscreenCtx;
    const w = this.offscreen.width / this.dpr;
    const h = this.offscreen.height / this.dpr;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);

    for (const a of this.actions) {
      if (!a || !a.id) continue;
      if (!this.committedIds.has(a.id)) continue;
      if (a.active === false) continue;
      this._drawStroke(ctx, a);
    }
    ctx.restore();
  }

  // Final visible draw: copy offscreen, draw remote in-progress actions, draw local currentStroke
  redraw() {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.offscreen, 0, 0, w, h);

    // draw remote in-progress actions (not committed)
    for (const a of this.actions) {
      if (!a || !a.id) continue;
      if (this.committedIds.has(a.id)) continue;
      // skip if this action matches local current stroke (to avoid duplicate draw)
      if (this.currentStroke && a.id === this.currentStroke.id) continue;
      if (a.points && a.points.length > 1 && a.active !== false) this._drawStroke(ctx, a);
    }

    // draw local in-progress stroke on top
    if (this.currentStroke && this.currentStroke.points && this.currentStroke.points.length > 1) {
      this._drawStroke(ctx, this.currentStroke);
    }
    ctx.restore();
  }

  _drawStroke(ctx, s) {
    if (!s || !s.points || s.points.length < 2) return;
    ctx.save();
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.lineWidth = s.width || 1;

    if (s.tool === "eraser") ctx.globalCompositeOperation = "destination-out";
    else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = s.color || "#000";
    }

    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      const p = s.points[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Start local stroke — DO NOT push into this.actions
  beginStroke(userId, startPoint) {
    this.isDrawing = true;
    this.currentStroke = {
      id: `${userId}:${Date.now()}:${Math.random().toString(36).slice(2,6)}`,
      userId,
      tool: this.tool,
      color: this.color,
      width: this.width,
      points: [startPoint],
      ts: Date.now(),
      active: true
    };
    // Draw overlay immediately
    this.redraw();
  }

  addPoint(p) {
    if (!this.isDrawing || !this.currentStroke) return;
    this.currentStroke.points.push(p);
    this.redraw();
  }

  // Commit local stroke: add to actions AND mark committed
  endStroke() {
    if (!this.currentStroke) return null;
    const s = this.currentStroke;
    // add to actions (if not present) and commit
    const idx = this.actions.findIndex(a => a.id === s.id);
    if (idx === -1) this.actions.push(Object.assign({}, s));
    else this.actions[idx] = Object.assign({}, s);

    this.committedIds.add(s.id);
    this.currentStroke = null;
    this.isDrawing = false;
    this.redrawOffscreen();
    this.redraw();
    return s;
  }

  setTool(t) { this.tool = t; }
  setColor(c) { this.color = c; }
  setWidth(w) { this.width = w; }

  setRemoteCursor(userId, x, y, name, color) {
    if (!this.cursors) return;
    let el = document.getElementById(`cursor-${userId}`);
    if (!el) {
      el = document.createElement("div");
      el.id = `cursor-${userId}`;
      el.className = "cursor";
      this.cursors.appendChild(el);
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.background = color || "rgba(67,97,238,0.9)";
    el.textContent = (name || userId).slice(0, 10);
  }

  removeCursor(userId) {
    const el = document.getElementById(`cursor-${userId}`);
    if (el) el.remove();
  }
}

window.CollaborativeCanvas = CollaborativeCanvas;
