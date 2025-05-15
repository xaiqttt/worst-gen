// worst-gen-client.js

const io = require('socket.io-client');
const crypto = require('crypto');
const readline = require('readline');

// Server URL
const SERVER_URL = 'https://worst-gen.onrender.com';
const SERVER_KEY = '7e8902f5d6b3a1c94d0eaf28b61538c7e9a0f4d2b8c5a7e3f6d9b0c2a5e7d8f1';

// Create socket connection
const socket = io(SERVER_URL);

// Readline setup for CLI input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let currentUser = null;

// Encryption utility functions
function encryptMessage(message, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(message, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { encryptedContent: encrypted, iv: iv.toString('hex') };
}

// Registration
function register() {
  rl.question('Enter your alias: ', (alias) => {
    const publicKey = crypto.randomBytes(32).toString('hex');

    socket.emit('register', {
      alias,
      publicKey,
      registrationKey: SERVER_KEY
    });
  });
}

// Login
function login() {
  rl.question('Enter your alias: ', (alias) => {
    socket.emit('login', { alias });
  });
}

// Send message
function sendMessage() {
  rl.question('Enter your message: ', (message) => {
    const { encryptedContent, iv } = encryptMessage(message, SERVER_KEY);
    socket.emit('message', { encryptedContent, iv });
  });
}

// Handle events
socket.on('connect', () => {
  console.log('Connected to server');
  register();
});

socket.on('registered', (data) => {
  console.log(data.message);
  login();
});

socket.on('login-success', (data) => {
  console.log(`Logged in as ${data.alias}`);
  currentUser = data.alias;
  console.log('Chat History:');
  data.history.forEach((msg) => {
    console.log(`[${msg.timestamp}] ${msg.sender}: ${msg.encryptedContent}`);
  });
  sendMessage();
});

socket.on('message', (data) => {
  console.log(`[${data.timestamp}] ${data.sender}: ${data.encryptedContent}`);
});

socket.on('error', (data) => {
  console.error('Error:', data.message);
});
