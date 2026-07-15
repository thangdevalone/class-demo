import dotenv from 'dotenv';
dotenv.config();

import connectDB from './config/db';
import { User } from './models/User';
import { Classroom } from './models/Classroom';
import mongoose from 'mongoose';

const seedData = async () => {
  await connectDB();

  console.log('🗑️  Clearing existing data...');
  await User.deleteMany({});
  await Classroom.deleteMany({});

  console.log('👤 Creating users...');

  // Admin
  const admin = await User.create({
    username: 'admin',
    password: 'admin123',
    displayName: 'Admin',
    role: 'admin',
    avatar: '',
  });

  console.log('\n✅ Seed completed successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Created accounts:');
  console.log('   Admin:    admin / admin123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  process.exit(0);
};

seedData().catch((error) => {
  console.error('❌ Seed error:', error);
  process.exit(1);
});
