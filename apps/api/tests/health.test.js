const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Use a separate test database
process.env.MONGODB_URI = 'mongodb://localhost:27017/namthanh_test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret';

const { app } = require('../src/index');
const { User } = require('../src/models');

describe('Health Check', () => {
  afterAll(async () => {
    await mongoose.connection.close();
  });

  it('GET /health should return 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('Nam Thanh Transport API');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('database');
  });

  it('GET /api should return API info', async () => {
    const res = await request(app).get('/api');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('1.0.0');
  });

  it('GET /unknown-route should return 404', async () => {
    const res = await request(app).get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('MongoDB Connection', () => {
  it('should connect to MongoDB', async () => {
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    const state = mongoose.connection.readyState;
    // 1 = connected, 2 = connecting
    expect([1, 2]).toContain(state);
  });
});

describe('Auth API', () => {
  let testUser;
  let testToken;

  beforeAll(async () => {
    // Wait for DB connection
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Clear test users
    await User.deleteMany({ phone: { $regex: /^099/ } });

    // Create test user
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash('test123', salt);

    testUser = await User.create({
      name: 'Test User',
      phone: '0990000001',
      password: hashedPassword,
      role: 'driver',
      status: 'active',
    });
  });

  afterAll(async () => {
    await User.deleteMany({ phone: { $regex: /^099/ } });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with correct credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        phone: '0990000001',
        password: 'test123',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data.user.phone).toBe('0990000001');
      expect(res.body.data.user.password).toBeUndefined();

      testToken = res.body.data.token;
    });

    it('should fail with wrong password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        phone: '0990000001',
        password: 'wrongpass',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should fail with non-existent user', async () => {
      const res = await request(app).post('/api/auth/login').send({
        phone: '0999999999',
        password: 'test123',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should fail with missing fields', async () => {
      const res = await request(app).post('/api/auth/login').send({
        phone: '0990000001',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user info with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.phone).toBe('0990000001');
    });

    it('should fail without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
