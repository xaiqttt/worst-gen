const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');
const { CronJob } = require('cron');

// Server Config
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Hardcoded server key
const SERVER_KEY = 'the7e8902f5d6b3a1c94d0eaf28b61538c7e9a0f4d2b8c5a7e3f6d9b0c2a5e7d8f1';

// In-Memory Storage
let users = {};
let chatHistory = [];

// Reset chat history at midnight (12 AM Philippines Time - UTC+8)
const resetChatHistory = new CronJob(
  '0 0 * * *',
  () => {
    console.log('[RESET] Clearing chat history and user list at midnight PH time');
    chatHistory = [];
    users = {};
    io.to('chat-room').emit('system-message', { content: 'Chat history has been reset.' });
  },
  null,
  true,
  'Asia/Manila'
);

resetChatHistory.start();

// Helper to format timestamp
const formatTimestamp = (date) => {
  return new Date(date).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Manila',
  });
};

// Socket.io Connection
io.on('connection', (socket) => {
  let currentUser = null;

  // Registration
  socket.on('register', (data) => {
    if (data.registrationKey !== SERVER_KEY) {
      socket.emit('error', { message: 'Invalid registration key' });
      return;
    }

    if (users[data.alias]) {
      socket.emit('error', { message: 'Alias already taken' });
      return;
    }

    currentUser = data.alias;
    users[currentUser] = socket.id;

    socket.join('chat-room');
    socket.emit('registered', { success: true, message: `Welcome, ${data.alias}!` });
    console.log(`[+] ${data.alias} joined the chat`);

    // Broadcast to other users
    socket.to('chat-room').emit('user-joined', { alias: currentUser });
  });

  // Login
  socket.on('login', (data) => {
    if (!users[data.alias]) {
      socket.emit('error', { message: 'Unknown alias' });
      return;
    }

    currentUser = data.alias;
    socket.join('chat-room');
    socket.emit('login-success', {
      success: true,
      alias: currentUser,
      history: chatHistory,
    });

    console.log(`[+] ${currentUser} logged in`);
    socket.to('chat-room').emit('user-joined', { alias: currentUser });
  });

  // Send Message
  socket.on('message', (data) => {
    if (!currentUser) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    const timestamp = formatTimestamp(new Date());
    const formattedMessage = `${timestamp} - ${currentUser}: ${data.content}`;

    const message = {
      sender: currentUser,
      content: formattedMessage,
      timestamp: timestamp,
    };

    // Add to chat history
    chatHistory.push(message);

    // Limit history to last 100 messages
    if (chatHistory.length > 100) chatHistory.shift();

    io.to('chat-room').emit('message', message);
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (currentUser) {
      delete users[currentUser];
      console.log(`[-] ${currentUser} left the chat`);
      socket.to('chat-room').emit('user-left', { alias: currentUser });
    }
  });
});

// Basic Routes
app.get('/', (req, res) => {
  res.send('Worst Generation Chat Server Running');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'up' });
});

// Start Server
server.listen(PORT, () => {
  console.log(`Worst Generation server running on port ${PORT}`);
});
