import { io } from 'socket.io-client';

const SERVER = window.location.origin;

let socket = null;
const listeners = {};

export function connect(sessionId) {
  if (socket?.connected) return;

  socket = io(SERVER, {
    auth: { sessionId },
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    emit('internal:connected');
    console.log('🟢 Socket connected');
  });

  socket.on('disconnect', (reason) => {
    emit('internal:disconnected', reason);
    console.log('🔴 Socket disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    emit('internal:error', err.message);
    console.error('Socket error:', err.message);
  });

  // Forward all server events to listeners
  const serverEvents = [
    'room-history', 'room-message', 'room-users',
    'user-joined', 'user-left',
    'im-message', 'im-sent',
    'buddy-status-changed', 'buddy-typing', 'buddy-stopped-typing',
    'error',
  ];

  for (const event of serverEvents) {
    socket.on(event, (data) => emit(event, data));
  }
}

export function disconnect() {
  socket?.disconnect();
  socket = null;
}

export function send(event, data) {
  socket?.emit(event, data);
}

export function sendWithAck(event, data) {
  return new Promise((resolve) => {
    socket?.emit(event, data, resolve);
  });
}

export function on(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter((l) => l !== fn);
}

function emit(event, data) {
  for (const fn of listeners[event] || []) {
    try { fn(data); } catch (e) { console.error(e); }
  }
}

export function isConnected() {
  return socket?.connected ?? false;
}
