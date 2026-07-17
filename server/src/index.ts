import dotenv from 'dotenv';
dotenv.config();

import cors from 'cors';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db';
import { User } from './models/User';
import authRoutes from './routes/auth';
import classroomRoutes from './routes/classroom';
import { setIO } from './socket';

const app = express();
const PORT = process.env.PORT || 3001;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  }
});

// Register IO instance for use in routes
setIO(io);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join_classroom', (classroomId) => {
    socket.join(`classroom_${classroomId}`);
  });

  socket.on('raise_hand', (data) => {
    io.to(`classroom_${data.classroomId}`).emit('hand_raised', data);
  });

  socket.on('cancel_hand', (data) => {
    io.to(`classroom_${data.classroomId}`).emit('hand_cancelled', data);
  });

  socket.on('accept_hand', (data) => {
    io.to(`classroom_${data.classroomId}`).emit('hand_accepted', data);
  });

  socket.on('complete_hand', (data) => {
    io.to(`classroom_${data.classroomId}`).emit('hand_completed', data);
  });

  socket.on('student_ready_for_call', (data) => {
    io.to(`classroom_${data.classroomId}`).emit('student_ready_for_call', data);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/classrooms', classroomRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auto-seed: only create admin account if it doesn't exist
const autoSeed = async () => {
  const adminExists = await User.findOne({ username: 'admin' });
  if (adminExists) {
    console.log('📦 Admin account exists, skipping seed.');
    return;
  }

  console.log('🌱 First run — creating admin account...');
  await User.create({
    username: 'admin',
    password: 'admin123',
    displayName: 'Admin',
    role: 'admin',
  });
  console.log('✅ Admin created: admin / admin123');
};

// Start server
const start = async () => {
  await connectDB();
  await autoSeed();

  server.listen(PORT, () => {
    console.log(`🚀 Class Demo Server running on http://localhost:${PORT}`);
    console.log(`📡 API: http://localhost:${PORT}/api`);
  });
};

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
