function addAction(room, action) {
  if (!room || !action || !action.id) return;
  const idx = room.actions.findIndex(a => a.id === action.id);
  if (idx === -1) room.actions.push(action);
  else {
    const existing = room.actions[idx];
    const merged = Object.assign({}, existing, action);
    if ((!merged.points || merged.points.length === 0) && existing.points) merged.points = existing.points;
    room.actions[idx] = merged;
  }
}

function lastActiveAction(room) {
  if (!room || !Array.isArray(room.actions)) return null;
  for (let i = room.actions.length - 1; i >= 0; i--) {
    const a = room.actions[i];
    if (a && a.active !== false) return a;
  }
  return null;
}

function lastUndoneAction(room) {
  if (!room || !Array.isArray(room.actions)) return null;
  for (let i = room.actions.length - 1; i >= 0; i--) {
    const a = room.actions[i];
    if (a && a.active === false) return a;
  }
  return null;
}

module.exports = { addAction, lastActiveAction, lastUndoneAction };
