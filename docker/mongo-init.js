// MongoDB initialization script
db = db.getSiblingDB('namthanh_db');

db.createUser({
  user: 'namthanh_user',
  pwd: 'namthanh_pass@2024',
  roles: [
    {
      role: 'readWrite',
      db: 'namthanh_db',
    },
  ],
});

// Create initial collections
const collections = [
  'users',
  'drivers',
  'vehicles',
  'trips',
  'tripimages',
  'gpslogs',
  'salaryadvances',
  'rewards',
  'disciplines',
  'attendanceadjustments',
  'leaverequests',
  'expenserequests',
  'purchaserequests',
  'additionaltrips',
  'materials',
  'locations',
  'requestattachments',
  'notifications',
  'requesthistories',
  'systemconfigs',
  'attendances',
  'driverfinances',
];

collections.forEach(name => {
  db.createCollection(name);
});

print('✅ Nam Thành DB initialized successfully');
