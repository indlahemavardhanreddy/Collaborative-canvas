const rooms = new Map();
function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { users: new Map(), actions: [] });
  return rooms.get(roomId);
}
module.exports = { rooms, getRoom };
