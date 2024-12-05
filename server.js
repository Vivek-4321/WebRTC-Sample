// const WebSocket = require('ws');
// const http = require('http');

// // Create HTTP server
// const server = http.createServer((req, res) => {
//     res.writeHead(200, { 'Content-Type': 'text/plain' });
//     res.end('WebSocket Signaling Server');
// });

// // Create WebSocket server
// const wss = new WebSocket.Server({ server });

// // Store connected clients
// const clients = new Map();

// wss.on('connection', (ws) => {
//     console.log('New client connected');

//     ws.on('message', (message) => {
//         const data = JSON.parse(message);

//         switch (data.type) {
//             case 'register':
//                 // Register the client with their username
//                 clients.set(data.username, ws);
//                 console.log(`User ${data.username} registered`);
//                 break;

//             case 'offer':
//             case 'answer':
//             case 'ice-candidate':
//             case 'hangup':
//                 // Forward signaling messages to the target user
//                 const targetClient = clients.get(data.to);
//                 if (targetClient) {
//                     targetClient.send(JSON.stringify(data));
//                 }
//                 break;
//         }
//     });

//     ws.on('close', () => {
//         // Remove the client from the map when disconnected
//         for (const [username, client] of clients.entries()) {
//             if (client === ws) {
//                 clients.delete(username);
//                 console.log(`User ${username} disconnected`);
//                 break;
//             }
//         }
//     });
// });

// // Start the server
// const PORT = 3000;
// server.listen(PORT, () => {
//     console.log(`Signaling server running on port ${PORT}`);
// });


const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const wrtc = require('wrtc');

app.use(express.static('public'));

const peers = new Map();
const streams = new Map();

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('join', async () => {
        // Send existing streams to new user
        for (const [peerId, stream] of streams) {
            if (peerId !== socket.id) {
                socket.emit('user-connected', peerId);
            }
        }
    });

    socket.on('offer', async (data) => {
        const { offer, targetId } = data;
        
        const peerConnection = new wrtc.RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });

        peers.set(socket.id, peerConnection);

        peerConnection.ontrack = (event) => {
            streams.set(socket.id, event.streams[0]);
            // Broadcast to all other users that a new stream is available
            socket.broadcast.emit('user-connected', socket.id);
        };

        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('answer', { answer, targetId: socket.id });
    });

    socket.on('ice-candidate', async (data) => {
        const { candidate, targetId } = data;
        const peer = peers.get(targetId);
        if (peer) {
            await peer.addIceCandidate(candidate);
        }
    });

    socket.on('disconnect', () => {
        const peer = peers.get(socket.id);
        if (peer) {
            peer.close();
            peers.delete(socket.id);
        }
        streams.delete(socket.id);
        io.emit('user-disconnected', socket.id);
        console.log('User disconnected');
    });
});

http.listen(3000, () => {
    console.log('Server running on port 3000');
});
