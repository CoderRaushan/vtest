// const path = require('path');
// const express = require('express');
// const app = express();
// const socketIO = require('socket.io');

// const port = process.env.PORT || 8080;
// const env = process.env.NODE_ENV || 'development';

// // Redirect to https
// app.get('*', (req, res, next) => {
//     if (req.headers['x-forwarded-proto'] !== 'https' && env !== 'development') {
//         return res.redirect(['https://', req.get('Host'), req.url].join(''));
//     }
//     next();
// });

// app.use(express.static(path.join(__dirname, 'public')));
// app.use(express.static(path.join(__dirname, 'node_modules')));

// const server = require('http').createServer(app);
// server.listen(port, () => {
//     console.log(`listening on port ${port}`);
// });

// /**
//  * Socket.io events
//  */
// const io = socketIO(server);
// io.sockets.on('connection', function (socket) {
//     /**
//      * Log actions to the client
//      */
//     function log() {
//         const array = ['Server:'];
//         array.push.apply(array, arguments);
//         socket.emit('log', array);
//     }

//     /**
//      * Handle message from a client
//      * If toId is provided message will be sent ONLY to the client with that id
//      * If toId is NOT provided and room IS provided message will be broadcast to that room
//      * If NONE is provided message will be sent to all clients
//      */
//     socket.on('message', (message, toId = null, room = null) => {
//         log('Client ' + socket.id + ' said: ', message);

//         if (toId) {
//             console.log('From ', socket.id, ' to ', toId, message.type);

//             io.to(toId).emit('message', message, socket.id);
//         } else if (room) {
//             console.log('From ', socket.id, ' to room: ', room, message.type);

//             socket.broadcast.to(room).emit('message', message, socket.id);
//         } else {
//             console.log('From ', socket.id, ' to everyone ', message.type);

//             socket.broadcast.emit('message', message, socket.id);
//         }
//     });

//     let roomAdmin; // save admins socket id (will get overwritten if new room gets created)

//     /**
//      * When room gets created or someone joins it
//      */
//     socket.on('create or join', (room) => {
//         log('Create or Join room: ' + room);

//         // Get number of clients in the room
//         const clientsInRoom = io.sockets.adapter.rooms.get(room);
//         let numClients = clientsInRoom ? clientsInRoom.size : 0;

//         if (numClients === 0) {
//             // Create room
//             socket.join(room);
//             roomAdmin = socket.id;
//             socket.emit('created', room, socket.id);
//         } else {
//             log('Client ' + socket.id + ' joined room ' + room);

//             // Join room
//             io.sockets.in(room).emit('join', room); // Notify users in room
//             socket.join(room);
//             io.to(socket.id).emit('joined', room, socket.id); // Notify client that they joined a room
//             io.sockets.in(room).emit('ready', socket.id); // Room is ready for creating connections
//         }
//     });

//     /**
//      * Kick participant from a call
//      */
//     socket.on('kickout', (socketId, room) => {
//         if (socket.id === roomAdmin) {
//             socket.broadcast.emit('kickout', socketId);
//             io.sockets.sockets.get(socketId).leave(room);
//         } else {
//             console.log('not an admin');
//         }
//     });

//     // participant leaves room
//     socket.on('leave room', (room) => {
//         socket.leave(room);
//         socket.emit('left room', room);
//         socket.broadcast.to(room).emit('message', { type: 'leave' }, socket.id);
//     });

//     /**
//      * When participant leaves notify other participants
//      */
//     socket.on('disconnecting', () => {
//         socket.rooms.forEach((room) => {
//             if (room === socket.id) return;
//             socket.broadcast
//                 .to(room)
//                 .emit('message', { type: 'leave' }, socket.id);
//         });
//     });
// });

const path = require('path');
const express = require('express');
const app = express();
const socketIO = require('socket.io');

const port = process.env.PORT || 8080;
const env = process.env.NODE_ENV || 'development';

// Store online users
const onlineUsers = new Map();

// Redirect to https
app.get('*', (req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https' && env !== 'development') {
        return res.redirect(['https://', req.get('Host'), req.url].join(''));
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'node_modules')));

const server = require('http').createServer(app);
server.listen(port, () => {
    console.log(`listening on port ${port}`);
});

/**
 * Socket.io events
 */
const io = socketIO(server);
io.sockets.on('connection', function (socket) {
    console.log('User connected:', socket.id);

    /**
     * Log actions to the client
     */
    function log() {
        const array = ['Server:'];
        array.push.apply(array, arguments);
        socket.emit('log', array);
    }

    /**
     * User registration
     */
    socket.on('register', (username) => {
        // Check if username already exists
        const existingUser = Array.from(onlineUsers.values()).find(user => user.username === username);
        if (existingUser) {
            socket.emit('registration-failed', 'Username already taken');
            return;
        }

        // Register user
        onlineUsers.set(socket.id, {
            id: socket.id,
            username: username,
            status: 'online',
            inCall: false
        });

        socket.emit('registration-success', {
            id: socket.id,
            username: username
        });

        // Broadcast updated user list to all clients
        io.emit('users-updated', Array.from(onlineUsers.values()));
        
        log('User registered:', username);
    });

    /**
     * Get online users
     */
    socket.on('get-online-users', () => {
        socket.emit('users-updated', Array.from(onlineUsers.values()));
    });

    /**
     * Initiate call
     */
    socket.on('initiate-call', (targetUserId) => {
        const caller = onlineUsers.get(socket.id);
        const target = onlineUsers.get(targetUserId);
        
        if (!target || target.inCall) {
            socket.emit('call-failed', 'User not available');
            return;
        }

        // Create unique room for this call
        const roomId = `call_${socket.id}_${targetUserId}_${Date.now()}`;
        
        // Notify target user about incoming call
        io.to(targetUserId).emit('incoming-call', {
            callerId: socket.id,
            callerName: caller.username,
            roomId: roomId
        });

        socket.emit('call-initiated', { roomId, targetUser: target.username });
        log('Call initiated from', caller.username, 'to', target.username);
    });

    /**
     * Accept call
     */
    socket.on('accept-call', (callData) => {
        const { callerId, roomId } = callData;
        const accepter = onlineUsers.get(socket.id);
        const caller = onlineUsers.get(callerId);

        if (caller && accepter) {
            // Update user status
            onlineUsers.get(socket.id).inCall = true;
            onlineUsers.get(callerId).inCall = true;

            // Join both users to the room
            socket.join(roomId);
            io.sockets.sockets.get(callerId).join(roomId);

            // Notify both users
            io.to(callerId).emit('call-accepted', { roomId, accepterName: accepter.username });
            socket.emit('call-connected', { roomId, callerName: caller.username });

            // Broadcast updated user list
            io.emit('users-updated', Array.from(onlineUsers.values()));

            log('Call accepted between', caller.username, 'and', accepter.username);
        }
    });

    /**
     * Reject call
     */
    socket.on('reject-call', (callerId) => {
        const rejecter = onlineUsers.get(socket.id);
        io.to(callerId).emit('call-rejected', rejecter ? rejecter.username : 'Unknown');
        log('Call rejected by', rejecter ? rejecter.username : socket.id);
    });

    /**
     * End call
     */
    socket.on('end-call', (roomId) => {
        const user = onlineUsers.get(socket.id);
        
        // Get all users in the room and end call for everyone
        const room = io.sockets.adapter.rooms.get(roomId);
        if (room) {
            room.forEach(socketId => {
                if (onlineUsers.has(socketId)) {
                    onlineUsers.get(socketId).inCall = false;
                    io.to(socketId).emit('call-ended');
                    io.sockets.sockets.get(socketId).leave(roomId);
                }
            });
        }

        // Broadcast updated user list
        io.emit('users-updated', Array.from(onlineUsers.values()));
        
        log('Call ended by', user ? user.username : socket.id);
    });

    /**
     * Handle message from a client (for WebRTC signaling)
     */
    socket.on('message', (message, toId = null, room = null) => {
        log('Client ' + socket.id + ' said: ', message);

        if (toId) {
            io.to(toId).emit('message', message, socket.id);
        } else if (room) {
            socket.broadcast.to(room).emit('message', message, socket.id);
        } else {
            socket.broadcast.emit('message', message, socket.id);
        }
    });

    /**
     * Join room for call
     */
    socket.on('join-call-room', (room) => {
        log('User joining call room: ' + room);
        
        const clientsInRoom = io.sockets.adapter.rooms.get(room);
        let numClients = clientsInRoom ? clientsInRoom.size : 0;

        log('Room ' + room + ' now has ' + numClients + ' client(s)');

        if (numClients < 2) {
            socket.join(room);
            log('Client ' + socket.id + ' joined room ' + room);
            
            if (numClients === 0) {
                // First user creates the room
                socket.emit('created', room, socket.id);
            } else if (numClients === 1) {
                // Second user joins
                log('Client ' + socket.id + ' joined room ' + room);
                io.sockets.in(room).emit('join', room);
                socket.emit('joined', room, socket.id);
                io.sockets.in(room).emit('ready', socket.id);
            }
        } else {
            socket.emit('room-full', room);
        }
    });

    /**
     * Leave room
     */
    socket.on('leave room', (room) => {
        socket.leave(room);
        socket.emit('left room', room);
        socket.broadcast.to(room).emit('message', { type: 'leave' }, socket.id);
    });

    /**
     * When participant disconnects
     */
    socket.on('disconnecting', () => {
        const user = onlineUsers.get(socket.id);
        
        // Notify other users in any rooms about disconnect
        socket.rooms.forEach((room) => {
            if (room !== socket.id) {
                socket.broadcast.to(room).emit('message', { type: 'leave' }, socket.id);
            }
        });

        // Remove user from online users
        onlineUsers.delete(socket.id);
        
        // Broadcast updated user list
        io.emit('users-updated', Array.from(onlineUsers.values()));
        
        log('User disconnected:', user ? user.username : socket.id);
    });
});