import { randomUUID } from 'crypto';
import { roomQueries, buddyQueries, userQueries } from '../db.js';
import { onlineUsers } from '../index.js';

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    const { userId, username } = socket.user;
    console.log(`🟢 ${username} connected (${socket.id})`);

    // Register user as online
    const userRecord = userQueries.findById.get(userId);
    onlineUsers.set(userId, {
      socketId: socket.id,
      username,
      status: 'online',
      awayMessage: userRecord?.away_message || 'Available',
      avatarColor: userRecord?.avatar_color || '#f5a623',
      avatarEmoji: userRecord?.avatar_emoji || '😊',
      displayName: userRecord?.display_name || username,
    });

    // Join a personal room for targeted DMs
    socket.join(`user_${userId}`);

    // Notify this user's watchers (people who have them as a buddy) that they are online
    notifyWatchers(io, userId, {
      type: 'buddy-online',
      userId,
      username,
      status: 'online',
      awayMessage: userRecord?.away_message || 'Available',
      avatarColor: userRecord?.avatar_color || '#f5a623',
      avatarEmoji: userRecord?.avatar_emoji || '😊',
      displayName: userRecord?.display_name || username,
    });

    // ─── Join Room ───────────────────────────────────────────────────────────
    socket.on('join-room', ({ roomId }) => {
      const room = roomQueries.findById.get(roomId);
      if (!room) return socket.emit('error', { message: 'Room not found' });

      // Leave any previously joined rooms (except personal room)
      for (const r of socket.rooms) {
        if (r !== socket.id && r !== `user_${userId}` && r.startsWith('room_')) {
          socket.leave(r);
          io.to(r).emit('user-left', {
            userId,
            username: onlineUsers.get(userId)?.username || username,
          });
        }
      }

      socket.join(`room_${roomId}`);

      // Send recent messages
      const messages = roomQueries.recentMessages.all(roomId).reverse();
      socket.emit('room-history', { roomId, messages });

      // Send current users in room
      const usersInRoom = getRoomUsers(io, `room_${roomId}`);
      socket.emit('room-users', { roomId, users: usersInRoom });

      // Notify room of new arrival
      socket.to(`room_${roomId}`).emit('user-joined', {
        userId,
        username,
        displayName: onlineUsers.get(userId)?.displayName || username,
        avatarColor: onlineUsers.get(userId)?.avatarColor || '#f5a623',
        avatarEmoji: onlineUsers.get(userId)?.avatarEmoji || '😊',
      });
    });

    // ─── Leave Room ──────────────────────────────────────────────────────────
    socket.on('leave-room', ({ roomId }) => {
      socket.leave(`room_${roomId}`);
      io.to(`room_${roomId}`).emit('user-left', { userId, username });
    });

    // ─── Send Room Message ───────────────────────────────────────────────────
    socket.on('send-message', ({ roomId, content }) => {
      if (!content?.trim()) return;
      if (content.length > 1000) return socket.emit('error', { message: 'Message too long' });

      const room = roomQueries.findById.get(roomId);
      if (!room) return socket.emit('error', { message: 'Room not found' });

      const msgId = randomUUID();
      roomQueries.insertMessage.run(msgId, roomId, userId, content.trim());

      const userData = onlineUsers.get(userId);
      const message = {
        id: msgId,
        roomId,
        userId,
        username,
        displayName: userData?.displayName || username,
        content: content.trim(),
        avatarColor: userData?.avatarColor || '#f5a623',
        avatarEmoji: userData?.avatarEmoji || '😊',
        timestamp: Date.now(),
      };

      io.to(`room_${roomId}`).emit('room-message', message);
    });

    // ─── Send Instant Message (DM) ───────────────────────────────────────────
    socket.on('send-im', ({ toUserId, content }) => {
      if (!content?.trim()) return;
      if (content.length > 1000) return;

      const userData = onlineUsers.get(userId);
      const dm = {
        fromUserId: userId,
        fromUsername: username,
        fromDisplayName: userData?.displayName || username,
        fromAvatarColor: userData?.avatarColor || '#f5a623',
        fromAvatarEmoji: userData?.avatarEmoji || '😊',
        content: content.trim(),
        timestamp: Date.now(),
      };

      // Send to recipient
      io.to(`user_${toUserId}`).emit('im-message', dm);
      // Echo back to sender (so their IM window also shows sent messages)
      socket.emit('im-sent', { ...dm, toUserId });
    });

    // ─── Set Status ──────────────────────────────────────────────────────────
    socket.on('set-status', ({ status, awayMessage }) => {
      const userData = onlineUsers.get(userId);
      if (!userData) return;

      userData.status = status; // 'online' | 'away'
      userData.awayMessage = awayMessage || userData.awayMessage;
      onlineUsers.set(userId, userData);

      notifyWatchers(io, userId, {
        type: 'buddy-status',
        userId,
        username,
        status,
        awayMessage: userData.awayMessage,
      });
    });

    // ─── Add Buddy via Socket ────────────────────────────────────────────────
    socket.on('get-online-status', ({ userIds }, callback) => {
      const statuses = {};
      for (const uid of userIds) {
        const data = onlineUsers.get(uid);
        statuses[uid] = data ? { status: data.status, awayMessage: data.awayMessage } : { status: 'offline' };
      }
      if (typeof callback === 'function') callback(statuses);
    });

    // ─── Typing Indicator ────────────────────────────────────────────────────
    socket.on('typing-start', ({ toUserId }) => {
      io.to(`user_${toUserId}`).emit('buddy-typing', { fromUserId: userId, fromUsername: username });
    });
    socket.on('typing-stop', ({ toUserId }) => {
      io.to(`user_${toUserId}`).emit('buddy-stopped-typing', { fromUserId: userId });
    });

    // ─── Disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔴 ${username} disconnected`);
      onlineUsers.delete(userId);

      notifyWatchers(io, userId, {
        type: 'buddy-offline',
        userId,
        username,
        status: 'offline',
      });
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notifyWatchers(io, userId, payload) {
  const watchers = buddyQueries.getWatcherIds.all(userId);
  for (const { user_id } of watchers) {
    const watcherData = onlineUsers.get(user_id);
    if (watcherData) {
      io.to(`user_${user_id}`).emit('buddy-status-changed', payload);
    }
  }
}

function getRoomUsers(io, roomName) {
  const sockets = io.sockets.adapter.rooms.get(roomName) || new Set();
  const users = [];
  for (const socketId of sockets) {
    const s = io.sockets.sockets.get(socketId);
    if (s?.user) {
      const data = onlineUsers.get(s.user.userId);
      users.push({
        userId: s.user.userId,
        username: s.user.username,
        displayName: data?.displayName || s.user.username,
        avatarColor: data?.avatarColor || '#f5a623',
        avatarEmoji: data?.avatarEmoji || '😊',
        status: data?.status || 'online',
      });
    }
  }
  return users;
}
