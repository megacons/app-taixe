require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Driver, Vehicle, Material, SystemConfig } = require('../models');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/namthanh_db';

async function seed() {
  try {
    console.info('🌱 Starting seeding...');

    await mongoose.connect(MONGODB_URI);
    console.info('✅ Connected to MongoDB');

    // Clear existing data (only for dev)
    if (process.env.NODE_ENV === 'development') {
      // Lưu lại avatar trước khi xóa (key theo phone)
      const existingUsers = await User.find({}).select('phone avatar').lean();
      const avatarMap = {};
      existingUsers.forEach(u => { if (u.avatar) avatarMap[u.phone] = u.avatar; });

      await User.deleteMany({});
      await Driver.deleteMany({});
      await Vehicle.deleteMany({});
      await Material.deleteMany({});
      await SystemConfig.deleteMany({});
      console.info('🗑️  Cleared existing data');
      console.info(`💾 Saved ${Object.keys(avatarMap).length} avatars`);

      // Inject avatarMap vào scope để dùng sau
      global.__seedAvatarMap = avatarMap;
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash('123456', salt);

    const avatarMap = global.__seedAvatarMap || {};

    // Create users (4 roles)
    const users = await User.create([
      {
        name: 'Quản lý Minh',
        phone: '0901000001',
        password: hashedPassword,
        role: 'manager',
        status: 'active',
        ...(avatarMap['0901000001'] ? { avatar: avatarMap['0901000001'] } : {}),
      },
      {
        name: 'Điều phối Hoa',
        phone: '0901000002',
        password: hashedPassword,
        role: 'coordinator',
        status: 'active',
        ...(avatarMap['0901000002'] ? { avatar: avatarMap['0901000002'] } : {}),
      },
      {
        name: 'Kế toán Lan',
        phone: '0901000003',
        password: hashedPassword,
        role: 'accountant',
        status: 'active',
        ...(avatarMap['0901000003'] ? { avatar: avatarMap['0901000003'] } : {}),
      },
      {
        name: 'Tài xế Hướng',
        phone: '0901000004',
        password: hashedPassword,
        role: 'driver',
        status: 'active',
        ...(avatarMap['0901000004'] ? { avatar: avatarMap['0901000004'] } : {}),
      },
      {
        name: 'Tài xế Tuấn',
        phone: '0901000005',
        password: hashedPassword,
        role: 'driver',
        status: 'active',
        ...(avatarMap['0901000005'] ? { avatar: avatarMap['0901000005'] } : {}),
      },
    ]);

    console.info(`✅ Created ${users.length} users`);

    // Create vehicles
    const vehicles = await Vehicle.create([
      {
        license_plate: '51C-12345',
        vehicle_type: 'dump_truck',
        brand: 'Hino',
        model: 'FM8JW7A',
        year: 2020,
        capacity: 15,
        status: 'active',
      },
      {
        license_plate: '51C-67890',
        vehicle_type: 'dump_truck',
        brand: 'Hyundai',
        model: 'HD320',
        year: 2021,
        capacity: 18,
        status: 'active',
      },
    ]);

    console.info(`✅ Created ${vehicles.length} vehicles`);

    // Create drivers
    const drivers = await Driver.create([
      {
        user_id: users[3]._id,
        employee_id: 'TX001',
        full_name: 'Tài xế Hướng',
        phone: '0901000004',
        license_number: 'B1-123456',
        license_type: 'C',
        department: 'Vận chuyển',
        position: 'Tài xế',
        status: 'active',
        vehicle_id: vehicles[0]._id,
      },
      {
        user_id: users[4]._id,
        employee_id: 'TX002',
        full_name: 'Tài xế Tuấn',
        phone: '0901000005',
        license_number: 'B1-789012',
        license_type: 'C',
        department: 'Vận chuyển',
        position: 'Tài xế',
        status: 'active',
        vehicle_id: vehicles[1]._id,
      },
    ]);

    console.info(`✅ Created ${drivers.length} drivers`);

    // Update user with driver_id
    await User.findByIdAndUpdate(users[3]._id, { driver_id: drivers[0]._id });
    await User.findByIdAndUpdate(users[4]._id, { driver_id: drivers[1]._id });

    // Update vehicle with assigned_driver
    await Vehicle.findByIdAndUpdate(vehicles[0]._id, { assigned_driver: drivers[0]._id });
    await Vehicle.findByIdAndUpdate(vehicles[1]._id, { assigned_driver: drivers[1]._id });

    // Create materials
    const materials = await Material.create([
      {
        material_name: 'Đá 1x2',
        code: 'DA1X2',
        description: 'Đá xây dựng 1x2',
        unit: 'chuyến',
        status: 'active',
        category: 'Đá xây dựng',
      },
      {
        material_name: 'Đá 4x6',
        code: 'DA4X6',
        description: 'Đá xây dựng 4x6',
        unit: 'chuyến',
        status: 'active',
        category: 'Đá xây dựng',
      },
      {
        material_name: 'Cát xây dựng',
        code: 'CAT',
        description: 'Cát xây dựng',
        unit: 'chuyến',
        status: 'active',
        category: 'Cát',
      },
    ]);

    console.info(`✅ Created ${materials.length} materials`);

    // Create system configs
    const configs = await SystemConfig.create([
      {
        key: 'overtime_threshold',
        value: 4,
        description: 'Số chuyến tối đa trong ngày trước khi tính tăng ca',
        data_type: 'number',
        category: 'salary',
      },
      {
        key: 'overtime_rate',
        value: 100000,
        description: 'Tiền tăng ca mỗi chuyến (VNĐ)',
        data_type: 'number',
        category: 'salary',
      },
      {
        key: 'gps_ping_interval',
        value: 30000,
        description: 'Khoảng thời gian ping GPS (ms)',
        data_type: 'number',
        category: 'gps',
      },
      {
        key: 'company_name',
        value: 'Công ty TNHH Vận tải Nam Thành',
        description: 'Tên công ty xuất hiện trên báo cáo',
        data_type: 'string',
        category: 'company',
      },
      {
        key: 'company_subtitle',
        value: 'Quản lý vận chuyển',
        description: 'Slogan/mô tả ngắn hiển thị dưới tên',
        data_type: 'string',
        category: 'company',
      },
      {
        key: 'logo_url',
        value: '',
        description: 'URL logo công ty',
        data_type: 'string',
        category: 'company',
      },
    ]);

    console.info(`✅ Created ${configs.length} system configs`);

    console.info('\n📊 Seed Summary:');
    console.info('═══════════════════════════════════════');
    console.info(`✅ Users: ${users.length}`);
    console.info(`   - Manager: ${users[0].phone} / 123456`);
    console.info(`   - Coordinator: ${users[1].phone} / 123456`);
    console.info(`   - Accountant: ${users[2].phone} / 123456`);
    console.info(`   - Driver 1: ${users[3].phone} / 123456`);
    console.info(`   - Driver 2: ${users[4].phone} / 123456`);
    console.info(`✅ Vehicles: ${vehicles.length}`);
    console.info(`✅ Drivers: ${drivers.length}`);
    console.info(`✅ Materials: ${materials.length}`);
    console.info(`✅ System Configs: ${configs.length}`);
    console.info('═══════════════════════════════════════');
    console.info('🎉 Seeding completed!\n');
    global.__seedAvatarMap = undefined;
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  }
}

seed();
