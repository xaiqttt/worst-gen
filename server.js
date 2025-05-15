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

// Hardcoded keys and MongoDB URI
const SERVER_KEY = 'the7e8902f5d6b3a1c94d0eaf28b61538c7e9a0f4d2b8c5a7e3f6d9b0c2a5e7d8f1';
const DATABASE_URL = 'mongodb+srv://0XAP0R41:LOSTINTHECIPHEROFDOUBT@worst-gen-gc.1nt8beb.mongodb.net/worst-generation?retryWrites=true&w=majority';

// Connect to MongoDB
mongoose.connect(DATABASE_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  tls: true,
  tlsAllowInvalidCertificates: true, // This bypasses SSL validation temporarily
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
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const Member = mongoose.model('Member', MemberSchema);
const Message = mongoose.model('Message', MessageSchema);

// Socket.io Connection
io.on('connection', (socket) => {
  let currentUser = null;

  // Registration
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
      socket.emit('registered', { success: true, message: `Welcome, ${data.alias}!` });
    } catch (error) {
      console.error('Registration error:', error);
      socket.emit('error', { message: 'Registration failed' });
    }
  });

  // Login
  socket.on('login', async (data) => {
    try {
      const member = await Member.findOne({ alias: data.alias });
      if (!member) {
        socket.emit('error', { message: 'Unknown alias' });
        return;
      }

      currentUser = data.alias;
      socket.join('chat-room');

      const recentMessages = await Message.find().sort({ timestamp: -1 }).limit(50).lean();
      socket.emit('login-success', {
        success: true,
        alias: data.alias,
        history: recentMessages.reverse(),
      });
    } catch (error) {
      console.error('Login error:', error);
      socket.emit('error', { message: 'Login failed' });
    }
  });

  // Send Message
  socket.on('message', async (data) => {
    try {
      if (!currentUser) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const message = new Message({
        sender: currentUser,
        content: data.content,
      });

      await message.save();
      io.to('chat-room').emit('message', {
        sender: currentUser,
        content: data.content,
        timestamp: message.timestamp,
      });
    } catch (error) {
      console.error('Message error:', error);
      socket.emit('error', { message: 'Message failed' });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (currentUser) {
      io.to('chat-room').emit('user-left', {
        alias: currentUser,
        timestamp: new Date(),
      });
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
