import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './env.js';
import { db } from './database.js';

// Extended socket with user data
interface AuthenticatedSocket extends Socket {
  userId?: string;
  tenantId?: string;
}

// Socket event types
export interface ServerToClientEvents {
  // Conversations
  'conversation:new': (conversation: any) => void;
  'conversation:updated': (conversation: any) => void;
  'conversation:deleted': (conversationId: string) => void;

  // Messages
  'message:new': (message: any) => void;
  'message:updated': (message: any) => void;
  'message:read': (data: { conversationId: string; messageIds: string[] }) => void;

  // Typing indicators
  'typing:start': (data: { conversationId: string; userId: string; userName: string }) => void;
  'typing:stop': (data: { conversationId: string; userId: string }) => void;

  // Connection events
  'user:online': (userId: string) => void;
  'user:offline': (userId: string) => void;

  // Errors
  'error': (error: { message: string; code?: string }) => void;
}

export interface ClientToServerEvents {
  // Join/leave conversation rooms
  'conversation:join': (conversationId: string) => void;
  'conversation:leave': (conversationId: string) => void;

  // Typing indicators
  'typing:start': (conversationId: string) => void;
  'typing:stop': (conversationId: string) => void;

  // Mark messages as read
  'message:read': (data: { conversationId: string; messageIds?: string[] }) => void;
}

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

// Get tenant_id from user
async function getTenantId(userId: string): Promise<string | null> {
  try {
    const result = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    return result.rows.length > 0 ? result.rows[0].tenant_id : null;
  } catch {
    return null;
  }
}

// Authenticate socket connection
async function authenticateSocket(socket: AuthenticatedSocket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    const tenantId = await getTenantId(decoded.userId);

    if (!tenantId) {
      return next(new Error('User not found'));
    }

    socket.userId = decoded.userId;
    socket.tenantId = tenantId;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
}

// Initialize Socket.IO
export function initializeSocket(httpServer: HttpServer): Server<ClientToServerEvents, ServerToClientEvents> {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(authenticateSocket as any);

  // Connection handler
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`[Socket] User connected: ${socket.userId} (tenant: ${socket.tenantId})`);

    // Join tenant room automatically
    if (socket.tenantId) {
      socket.join(`tenant:${socket.tenantId}`);
    }

    // Broadcast user online
    if (socket.tenantId) {
      socket.to(`tenant:${socket.tenantId}`).emit('user:online', socket.userId!);
    }

    // Join conversation room
    socket.on('conversation:join', async (conversationId: string) => {
      try {
        // Verify user has access to this conversation
        const result = await db.query(
          'SELECT id FROM conversas WHERE id = $1 AND tenant_id = $2',
          [conversationId, socket.tenantId]
        );

        if (result.rows.length > 0) {
          socket.join(`conversation:${conversationId}`);
          console.log(`[Socket] User ${socket.userId} joined conversation ${conversationId}`);
        }
      } catch (error) {
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    // Leave conversation room
    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`[Socket] User ${socket.userId} left conversation ${conversationId}`);
    });

    // Typing indicators
    socket.on('typing:start', async (conversationId: string) => {
      try {
        const userResult = await db.query('SELECT name FROM users WHERE id = $1', [socket.userId]);
        const userName = userResult.rows[0]?.name || 'Usuário';

        socket.to(`conversation:${conversationId}`).emit('typing:start', {
          conversationId,
          userId: socket.userId!,
          userName,
        });
      } catch {
        // Ignore errors
      }
    });

    socket.on('typing:stop', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', {
        conversationId,
        userId: socket.userId!,
      });
    });

    // Mark messages as read via socket
    socket.on('message:read', async ({ conversationId, messageIds }) => {
      try {
        if (messageIds && messageIds.length > 0) {
          await db.query(
            `UPDATE mensagens SET lida = true, lida_em = NOW()
             WHERE conversa_id = $1 AND tenant_id = $2 AND id = ANY($3)`,
            [conversationId, socket.tenantId, messageIds]
          );
        } else {
          await db.query(
            `UPDATE mensagens SET lida = true, lida_em = NOW()
             WHERE conversa_id = $1 AND tenant_id = $2 AND lida = false AND remetente_tipo IN ('cliente', 'customer')`,
            [conversationId, socket.tenantId]
          );
        }

        // Notify other users in the conversation
        socket.to(`conversation:${conversationId}`).emit('message:read', {
          conversationId,
          messageIds: messageIds || [],
        });
      } catch (error) {
        socket.emit('error', { message: 'Failed to mark messages as read' });
      }
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`[Socket] User disconnected: ${socket.userId}`);

      if (socket.tenantId) {
        socket.to(`tenant:${socket.tenantId}`).emit('user:offline', socket.userId!);
      }
    });
  });

  console.log('[Socket] Socket.IO initialized');
  return io;
}

// Get Socket.IO instance
export function getIO(): Server<ClientToServerEvents, ServerToClientEvents> | null {
  return io;
}

// Emit to tenant room
export function emitToTenant(tenantId: string, event: keyof ServerToClientEvents, data: any) {
  if (io) {
    io.to(`tenant:${tenantId}`).emit(event, data);
  }
}

// Emit to conversation room
export function emitToConversation(conversationId: string, event: keyof ServerToClientEvents, data: any) {
  if (io) {
    io.to(`conversation:${conversationId}`).emit(event, data);
  }
}

// Emit new message event
export function emitNewMessage(tenantId: string, conversationId: string, message: any) {
  if (io) {
    // Emit to conversation room
    io.to(`conversation:${conversationId}`).emit('message:new', message);
    // Also emit to tenant room for conversation list updates
    io.to(`tenant:${tenantId}`).emit('message:new', message);
  }
}

// Emit conversation update
export function emitConversationUpdate(tenantId: string, conversation: any) {
  if (io) {
    io.to(`tenant:${tenantId}`).emit('conversation:updated', conversation);
  }
}

// Emit new conversation
export function emitNewConversation(tenantId: string, conversation: any) {
  if (io) {
    io.to(`tenant:${tenantId}`).emit('conversation:new', conversation);
  }
}
