require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const User = require('./src/models/User');
  const users = await User.find({
    role: { $in: ['manager', 'coordinator', 'accountant', 'driver'] }
  }).select('name role phone fcm_token').lean();

  console.log('\n=== Push Tokens ===');
  users.forEach(u => {
    console.log(`${u.name} (${u.role}) - ${u.phone}`);
    console.log(`  token: ${u.fcm_token || 'NULL - chưa lưu'}`);
  });
  process.exit(0);
}).catch(e => {
  console.error(e.message);
  process.exit(1);
});
