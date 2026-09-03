require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  // Cho phép polling để Expo Go tunnel hoạt động
  allowEIO3: true,
  transports: ['polling', 'websocket'],
});

// Firebase Admin SDK (optional — only if credentials are configured)
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    const admin = require('firebase-admin');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    app.set('firebaseAdmin', admin);
    console.info('✅ Firebase Admin initialized');
  } catch (err) {
    console.warn('⚠️  Firebase Admin init failed (FCM disabled):', err.message);
  }
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static('uploads'));

// Make io available to routes
app.set('io', io);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Nam Thanh Transport API',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// API Routes
const authRoutes          = require('./routes/auth');
const driverRoutes        = require('./routes/drivers');
const userRoutes          = require('./routes/users');
const vehicleRoutes       = require('./routes/vehicles');
const tripRoutes          = require('./routes/trips');
const uploadRoutes        = require('./routes/uploads');
const gpsRoutes           = require('./routes/gps');
const requestRoutes       = require('./routes/requests');
const notificationRoutes  = require('./routes/notifications');
const materialRoutes      = require('./routes/materials');
const reportRoutes        = require('./routes/reports');
const fundRoutes          = require('./routes/fund');
const attendanceRoutes    = require('./routes/attendance');

app.get('/api', (req, res) => {
  res.json({
    message: 'Nam Thanh Transport API',
    version: '1.0.0',
    endpoints: {
      health:        '/health',
      auth:          '/api/auth',
      drivers:       '/api/drivers',
      vehicles:      '/api/vehicles',
      trips:         '/api/trips',
      uploads:       '/api/uploads',
      gps:           '/api/gps',
      requests:      '/api/requests',
      notifications: '/api/notifications',
      materials:     '/api/materials',
      configs:       '/api/materials/configs',
      reports: {
        driver_monthly: '/api/reports/driver-monthly?driverId=&month=&year=',
        trip_log:       '/api/reports/trip-log?vehicleId=&from=&to=',
        payroll:        '/api/reports/payroll?month=&year=',
      },
    },
  });
});

app.use('/api/auth',          authRoutes);
app.use('/api/drivers',       driverRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/vehicles',      vehicleRoutes);
app.use('/api/trips',         tripRoutes);
app.use('/api/uploads',       uploadRoutes);
app.use('/api/gps',           gpsRoutes);
app.use('/api/requests',      requestRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/materials',     materialRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/fund',          fundRoutes);
app.use('/api/attendance',   attendanceRoutes);


// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Socket.io connection — GPS tracking & realtime updates
io.on('connection', socket => {
  console.info('Client connected:', socket.id);

  // User join room cá nhân để nhận notifications
  socket.on('join:user', userId => {
    socket.join(`user_${userId}`);
    console.info(`[Socket] User ${userId} joined room user_${userId}`);
  });

  // Admin join room để nhận tất cả updates
  socket.on('join:admin', () => {
    socket.join('admin');
    console.info(`[Socket] Client ${socket.id} joined admin room`);
  });

  // Admin join room để theo dõi xe cụ thể
  socket.on('watch:driver', driverId => {
    socket.join(`driver:${driverId}`);
  });

  socket.on('unwatch:driver', driverId => {
    socket.leave(`driver:${driverId}`);
  });

  socket.on('disconnect', () => {
    console.info('Client disconnected:', socket.id);
  });
});

// MongoDB Connection
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/namthanh_db';

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.info('✅ Connected to MongoDB');

    // ── Migration: sinh mã nhân viên cho các user chưa có ──
    try {
      const { User } = require('./models');
      const noIdUsers = await User.find({
        is_deleted: { $ne: true },
        role:       { $in: ['employee', 'coordinator', 'accountant', 'manager'] },
        $or: [{ employee_id: null }, { employee_id: { $exists: false } }, { employee_id: '' }],
      }).sort('created_at').lean();

      if (noIdUsers.length > 0) {
        console.info(`🔧 Migration: sinh mã NV cho ${noIdUsers.length} tài khoản...`);
        // Lấy số lớn nhất hiện có để tránh trùng
        const existingIds = await User.find({
          employee_id: { $regex: /^NT\d+$/ },
          is_deleted: { $ne: true },
        }).select('employee_id').lean();
        const maxNum = existingIds.reduce((max, u) => {
          const n = parseInt(u.employee_id.replace('NT', ''));
          return n > max ? n : max;
        }, 0);

        let counter = maxNum;
        for (const u of noIdUsers) {
          counter++;
          const newId = `NT${String(counter).padStart(3, '0')}`;
          await User.updateOne({ _id: u._id }, { $set: { employee_id: newId } });
        }
        console.info(`✅ Migration xong: đã gán mã NT cho ${noIdUsers.length} tài khoản`);
      }
    } catch (e) {
      console.warn('⚠️ Migration mã NV thất bại:', e.message);
    }

    // ── Migration: xóa unique index driver_id_1_date_1 trong fundentries nếu có ──
    try {
      const db = mongoose.connection.db;
      const indexes = await db.collection('fundentries').indexes();
      const oldIdx = indexes.find(idx => idx.name === 'driver_id_1_date_1' && idx.unique);
      if (oldIdx) {
        await db.collection('fundentries').dropIndex('driver_id_1_date_1');
        console.info('✅ Migration: đã xóa unique index driver_id_1_date_1 trong fundentries');
      }
    } catch (e) {
      console.warn('⚠️ Migration fundentries index:', e.message);
    }
    try {
      const db = mongoose.connection.db;
      const indexes = await db.collection('attendances').indexes();
      const oldIndex = indexes.find(idx => idx.name === 'driver_id_1_date_1');
      if (oldIndex) {
        await db.collection('attendances').dropIndex('driver_id_1_date_1');
        console.info('✅ Migration: đã xóa index cũ driver_id_1_date_1 trong attendances');
      }
    } catch (e) {
      console.warn('⚠️ Migration drop index thất bại:', e.message);
    }

    server.listen(PORT, () => {
      console.info(`🚀 Server running on port ${PORT}`);
      console.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);

      // Khởi động birthday cron job
      const { startBirthdayCron } = require('./utils/birthdayCron');
      startBirthdayCron();

      // Khởi động Cloudinary cleanup cron (mỗi Chủ nhật 2h sáng)
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        const { startCloudinaryCleanup } = require('./utils/cloudinaryCleanup');
        startCloudinaryCleanup();
      }
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.info('MongoDB connection closed');
      process.exit(0);
    });
  });
});

module.exports = { app, server, io };
