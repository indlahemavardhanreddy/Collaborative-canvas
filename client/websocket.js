function socketConnect(serverUrl) {
  const socket = io(serverUrl, { transports: ["websocket"] });
  function send(event, data) { socket.emit(event, data); }
  function on(event, cb) { socket.on(event, cb); }
  return { socket, send, on };
}
window.socketConnect = socketConnect;
