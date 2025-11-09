# Collaborative Canvas

A small collaborative drawing application built with Node.js, Express, and Socket.IO. Multiple users can draw on a shared canvas in real time, see remote cursors, and perform undo/redo.

## Setup (works with `npm install && npm start`)

1. Ensure you have Node.js v14 or newer installed.
2. Unzip the project and open a terminal in the project folder where `package.json` is located:
collaborative-canvas/
├─ client/
├─ server/
└─ package.json

markdown
Copy code
3. Install dependencies:
npm install

markdown
Copy code
4. Start the server:
npm start

sql
Copy code
5. Open your browser at `http://localhost:3000` (or set the `PORT` environment variable to use a different port).

## How to test with multiple users

- Open multiple browser tabs or windows and point each one to `http://localhost:3000`.
- To test different rooms, add a `?room=roomName` query parameter, for example:
`http://localhost:3000/?room=whiteboard1`
- Each tab should pick a unique user ID to simulate distinct users.
- Use an incognito/private window for one tab to avoid session/cookie collisions.
- Optionally use browser devtools network throttling to simulate latency and test undo/redo under lag.

## Known limitations and bugs

- State is in-memory only. Restarting the server clears all drawings.
- No authentication. User IDs are free text and are not validated; duplicates are possible.
- Undo/redo operates on a global per-room action list rather than per-user stacks.
- Conflict model is simple: last-write-wins for patches to the same action id.
- Large numbers of actions may slow client redraws; there is no action pruning or pagination.
- Limited offline handling: partially sent strokes may be incomplete if a client disconnects mid-stroke.
- No rate limiting or abuse protection; malicious clients can flood the server.

If you find other issues, please open an issue with steps to reproduce.

## Time spent (approximate)

- Scaffold and server with socket handlers: 3 to 4 hours
- Client canvas implementation and UI: 2 to 3 hours
- Undo/redo and testing: 1 to 2 hours

Estimated total: 6 to 9 hours
Deployment link : https://render.com/docs/web-services#port-binding
