const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Server Configuration
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Environment variables (set these in Render dashboard)
const SERVER_KEY = process.env.SERVER_KEY || crypto.randomBytes(32).toString('hex');
const DATABASE_URL = process.env.MONGODB_URI || 'mongodb://localhost:27017/worst-generation';

// Connect to MongoDB
mongoose.connect(DATABASE_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB database');
});

// Define Schemas
const MemberSchema = new mongoose.Schema({
  alias: { type: String, required: true, unique: true },
  publicKey: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  encryptedContent: { type: String, required: true },
  iv: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

// Create Models
const Member = mongoose.model('Member', MemberSchema);
const Message = mongoose.model('Message', MessageSchema);

// Socket.io connection handling
io.on('connection', async (socket) => {
  let currentUser = null;

  socket.on('register', async (data) => {
    try {
      // Check if the registration key matches the server key
      if (data.registrationKey !== SERVER_KEY) {
        socket.emit('error', { message: 'Invalid registration key' });
        return;
      }

      // Check if alias already exists
      const existingMember = await Member.findOne({ alias: data.alias });
      if (existingMember) {
        socket.emit('error', { message: 'Alias already taken' });
        return;
      }

      // Create new member
      const newMember = new Member({
        alias: data.alias,
        publicKey: data.publicKey
      });
      
      await newMember.save();
      currentUser = data.alias;
      
      socket.join('chat-room');
      socket.emit('registered', { 
        success: true, 
        message: `Welcome to Worst Generation, ${data.alias}!` 
      });
      
      // Broadcast to other members
      socket.to('chat-room').emit('user-joined', { 
        alias: data.alias, 
        timestamp: new Date() 
      });
      
    } catch (error) {
      console.error('Registration error:', error);
      socket.emit('error', { message: 'Registration failed' });
    }
  });

  socket.on('login', async (data) => {
    try {
      // Verify that the member exists
      const member = await Member.findOne({ alias: data.alias });
      if (!member) {
        socket.emit('error', { message: 'Unknown alias' });
        return;
      }

      // In a real application, you would verify the signature here
      // For simplicity, we're just checking if the alias exists
      
      currentUser = data.alias;
      socket.join('chat-room');
      
      // Get recent chat history
      const recentMessages = await Message.find()
        .sort({ timestamp: -1 })
        .limit(50)
        .lean();
      
      socket.emit('login-success', { 
        success: true, 
        alias: data.alias,
        history: recentMessages.reverse()
      });
      
      socket.to('chat-room').emit('user-joined', { 
        alias: data.alias, 
        timestamp: new Date() 
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
      
      // Save message to database
      const message = new Message({
        sender: currentUser,
        encryptedContent: data.encryptedContent,
        iv: data.iv
      });
      
      await message.save();
      
      // Broadcast message to all clients
      io.to('chat-room').emit('message', {
        id: message._id,
        sender: currentUser,
        encryptedContent: data.encryptedContent,
        iv: data.iv,
        timestamp: message.timestamp
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
        timestamp: new Date() 
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
