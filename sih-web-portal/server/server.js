import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import issueRoutes from './routes/issues.js';
import authRoutes from './routes/auth.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Without this, req.ip is the proxy's address behind a load balancer and the
// rate limiter would bucket every client together.
app.set('trust proxy', 1);

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Socket.io
export const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
});

io.on('connection', (socket) => {
  socket.join('admins');
  socket.on('join_user', (userId) => {
    if (userId) socket.join(`user_${userId}`);
  });
});

connectDB();

app.use('/api/issues', issueRoutes);
app.use('/api/auth', authRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Several conveniences are gated on NODE_ENV. Deploying without setting it
  // silently leaves them on, so say plainly which ones are active.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '\n[dev] NODE_ENV is not "production". Development conveniences are ACTIVE:\n' +
      '      · /auth/aadhaar/request-otp returns the OTP in its response\n' +
      '      · /auth/forgot-password returns the reset link in its response\n' +
      '        (which also makes that endpoint distinguish real from unknown\n' +
      '         addresses — it does not in production)\n' +
      '      Set NODE_ENV=production before deploying.\n'
    );
  }
});
