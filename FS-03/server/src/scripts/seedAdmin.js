// Run once: npm run seed:admin  -> creates the admin account (admins can't self-register).
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const email = process.env.ADMIN_EMAIL;
  if (await User.findOne({ email })) {
    console.log('Admin already exists');
  } else {
    await User.create({ name: 'Admin', email, password: process.env.ADMIN_PASSWORD, role: 'admin' });
    console.log(`Admin created: ${email}`);
  }
  await mongoose.disconnect();
})();
