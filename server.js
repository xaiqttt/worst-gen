// server.js - Hacker Red Themed Terminal Group Chat Server

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const figlet = require('figlet');

dotenv.config();

const PORT = process.env.PORT || 3000;
const AUTH_KEY = "the7e8902f5d6b3a1c94d0eaf28b61538c7e9a0f4d2b8c5a7e3f6d9b0c2a5e7d8f1";
const MONGO_URI = process.env.MONGO_URI;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Connect to MongoDB
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => logToUI('{bold}{red-fg}MongoDB connected{/red-fg}{/bold}'))
  .catch(err => logToUI(`{bold}{red-fg}MongoDB connection error: ${err}{/red-fg}{/bold}`));

// MongoDB schema
const chatSchema = new mongoose.Schema({
  alias: String,
  msg: String,
  timestamp: { type: Date, default: Date.now }
});

const ChatMessage = mongoose.model('ChatMessage', chatSchema);

// ===== Blessed Screen Setup =====
const screen = blessed.screen({
  smartCSR: true,
  title: 'WORST GENERATION - Terminal Group Chat Server',
  dockBorders: true,
  style: {
    bg: 'black'
  }
});

// Render WORST GENERATION ASCII Banner on top
const bannerText = figlet.textSync('WORST GENERATION', { 
  font: 'Big',
  horizontalLayout: 'default',
  verticalLayout: 'default',
  width: 100,
  whitespaceBreak: true
});

const banner = blessed.box({
  top: 0,
  left: 'center',
  width: '100%',
  height: 7,
  content: bannerText,
  tags: true,
  style: {
    fg: 'red',
    bg: 'black',
  },
  align: 'center',
  valign: 'middle'
});
screen.append(banner);

// Grid Layout (9 rows below banner)
const grid = new contrib.grid({rows: 9, cols: 12, screen: screen});

// Chat log panel (8 rows x 9 cols)
const chatLog = grid.set(0, 0, 8, 9, blessed.log, {
  label: '{red-fg} Chat Log {/red-fg}',
  tags: true,
  border: {type: 'line'},
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'red' },
    scrollbar: { bg: 'red' }
  },
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    ch: ' ',
    inverse: true
  }
});

// Connected users list (8 rows x 3 cols)
const usersList = grid.set(0, 9, 8, 3, blessed.list, {
  label: '{red-fg} Connected Users {/red-fg}',
  tags: true,
  border: {type: 'line'},
  style: {
    fg: 'red',
    bg: 'black',
    selected: { bg: 'red', fg: 'black' },
    border: { fg: 'red' }
  },
  keys: true,
  vi: true,
  mouse: true,
  interactive: true,
});

// Server stats box (1 row full width below)
const statsBox = grid.set(8, 0, 1, 12, blessed.box, {
  label: '{red-fg} Server Stats {/red-fg}',
  tags: true,
  style: {
    fg: 'red',
    bg: 'black',
    border: { fg: 'red' }
  },
  border: { type: 'line' },
  content: '',
  height: 1
});

screen.key(['escape', 'q', 'C-c'], () => {
  logToUI('{red-fg}Server shutting down...{/red-fg}');
  process.exit(0);
});

screen.render();

// Utility function to log chat messages to UI
function logToUI(text) {
  chatLog.log(text);
  screen.render();
}

// ===== Chat Server Logic =====
const users = new Map();  // alias => socket.id
let totalMessages = 0;

function updateUsersUI() {
  const userAliases = Array.from(users.keys()).sort();
  usersList.setItems(userAliases);
  screen.render();
}

function updateStats() {
  statsBox.setContent(
    `{bold}Users:{/bold} ${users.size}  |  {bold}Total Messages:{/bold} ${totalMessages}`
  );
  screen.render();
}

io.use((socket, next) => {
  const { key, alias } = socket.handshake.query;
  if (key !== AUTH_KEY) return next(new Error('Invalid key'));
  if (!alias || users.has(alias)) return next(new Error('Invalid or duplicate alias'));
  socket.alias = alias;
  next();
});

io.on('connection', async (socket) => {
  users.set(socket.alias, socket.id);
  updateUsersUI();
  logToUI(`{green-fg}[+] {bold}${socket.alias}{/bold} connected{/green-fg}`);
  updateStats();

  // Send past messages (limit 50)
  const pastMessages = await ChatMessage.find().sort({ timestamp: -1 }).limit(50).lean();
  socket.emit('pastMessages', pastMessages.reverse());

  socket.on('message', async (msg) => {
    totalMessages++;
    const cleanMsg = msg.toString().substring(0, 1000); // limit message length
    const chatMessage = new ChatMessage({ alias: socket.alias, msg: cleanMsg });
    await chatMessage.save();
    const formattedMsg = `{red-fg}[${socket.alias}]{/red-fg}: ${cleanMsg}`;
    logToUI(formattedMsg);
    io.emit('message', { alias: socket.alias, msg: cleanMsg });
    updateStats();
  });

  socket.on('disconnect', () => {
    users.delete(socket.alias);
    updateUsersUI();
    logToUI(`{yellow-fg}[-] {bold}${socket.alias}{/bold} disconnected{/yellow-fg}`);
    updateStats();
  });
});

server.listen(PORT, () => {
  logToUI(`{bold}{red-fg}Server running on port ${PORT}{/red-fg}{/bold}`);
});
