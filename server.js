const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Server Config
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Hardcoded keys and DB URI
const SERVER_KEY = process.env.SERVER_KEY || 'the7e8902f5d6b3a1c94d0eaf28b61538c7e9a0f4d2b8c5a7e3f6d9b0c2a5e7d8f1';
const DATABASE_URL = 'mongodb+srv://0XAP0R41:6oJuaT0DBWRl61Bg@worst-gen-gc.1nt8beb.mongodb.net/?retryWrites=true&w=majority&tls=true&appName=worst-gen-gc';

// Connect to MongoDB with TLS
mongoose.connect(DATABASE_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  tls: true,
  tlsAllowInvalidCertificates: false,
});

const db = mongoose.connection;
db.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});
db.once('open', () => {
  console.log('Connected to MongoDB database');
});

// Define Schemas
const MemberSchema = new mongoose.Schema({
  alias: { type: String, required: true, unique: true },
  publicKey: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now },
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  encryptedContent: { type: String, required: true },
  iv: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

// Models
const Member = mongoose.model('Member', MemberSchema);
const Message = mongoose.model('Message', MessageSchema);

// Socket.io connection
io.on('connection', async (socket) => {
  let currentUser = null;

  socket.on('register', async (data) => {
    try {
      if (data.registrationKey !== SERVER_KEY) {
        socket.emit('error', { message: 'Invalid registration key' });
        return;
      }

      const existingMember = await Member.findOne({ alias: data.alias });
      if (existingMember) {
        socket.emit('error', { message: 'Alias already taken' });
        return;
      }

      const newMember = new Member({
        alias: data.alias,
        publicKey: data.publicKey,
      });

      await newMember.save();
      currentUser = data.alias;

      socket.join('chat-room');
      socket.emit('registered', {
        success: true,
        message: `Welcome to Worst Generation, ${data.alias}!`,
      });

      socket.to('chat-room').emit('user-joined', {
        alias: data.alias,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Registration error:', error);
      socket.emit('error', { message: 'Registration failed' });
    }
  });

  socket.on('login', async (data) => {
    try {
      const member = await Member.findOne({ alias: data.alias });
      if (!member) {
        socket.emit('error', { message: 'Unknown alias' });
        return;
      }

      currentUser = data.alias;
      socket.join('chat-room');

      const recentMessages = await Message.find()
        .sort({ timestamp: -1 })
        .limit(50)
        .lean();

      socket.emit('login-success', {
        success: true,
        alias: data.alias,
        history: recentMessages.reverse(),
      });

      socket.to('chat-room').emit('user-joined', {
        alias: data.alias,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Login error:', error);
      socket.emit('error', { message: 'Login failed' });
    }
  });

  socket.on('message', async (data) => {
    try {
      if (!currentUser) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const message = new Message({
        sender: currentUser,
        encryptedContent: data.encryptedContent,
        iv: data.iv,
      });

      await message.save();

      io.to('chat-room').emit('message', {
        id: message._id,
        sender: currentUser,
        encryptedContent: data.encryptedContent,
        iv: data.iv,
        timestamp: message.timestamp,
      });
    } catch (error) {
      console.error('Message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('disconnect', () => {
    if (currentUser) {
      socket.to('chat-room').emit('user-left', {
        alias: currentUser,
        timestamp: new Date(),
      });
    }
  });
});

// Basic routes
app.get('/', (req, res) => {
  res.send('Worst Generation Chat Server Running');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'up' });
});

// Start server
server.listen(PORT, () => {
  console.log(`Worst Generation server running on port ${PORT}`);
});
