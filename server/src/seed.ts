import dotenv from 'dotenv';
dotenv.config();

import connectDB from './config/db';
import { User } from './models/User';
import { Classroom } from './models/Classroom';

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

  // Teachers
  const teacher1 = await User.create({
    username: 'teacher01',
    password: 'teacher123',
    displayName: 'Thầy Nguyễn Văn A',
    role: 'teacher',
    avatar: '',
    ermisUserId: '', // Fill with actual Ermis user ID
    ermisToken: '',  // Fill with actual Ermis token
  });

  const teacher2 = await User.create({
    username: 'teacher02',
    password: 'teacher123',
    displayName: 'Cô Trần Thị B',
    role: 'teacher',
    avatar: '',
    ermisUserId: '',
    ermisToken: '',
  });

  // Students
  const students = [];
  const studentNames = [
    'Lê Văn C', 'Phạm Thị D', 'Hoàng Văn E',
    'Ngô Thị F', 'Đặng Văn G',
  ];

  for (let i = 0; i < studentNames.length; i++) {
    const student = await User.create({
      username: `student0${i + 1}`,
      password: 'student123',
      displayName: studentNames[i],
      role: 'student',
      avatar: '',
      ermisUserId: '', // Fill with actual Ermis user ID
      ermisToken: '',  // Fill with actual Ermis token
    });
    students.push(student);
  }

  console.log('🏫 Creating classrooms...');

  await Classroom.create({
    name: 'Toán 10A - Buổi sáng',
    description: 'Lớp học Toán nâng cao cho khối 10',
    cameras: [
      {
        name: 'Camera 1 - Tổng quan',
        url: 'https://classroom-mediaserver.ermis.network/live/camera-01/master.m3u8',
        description: 'Camera tổng quan lớp học',
      },
      {
        name: 'Camera 2 - Bảng',
        url: 'https://classroom-mediaserver.ermis.network/live/camera-02/master.m3u8',
        description: 'Camera chiếu bảng giảng',
      },
      {
        name: 'Camera 3 - Học sinh',
        url: 'https://classroom-mediaserver.ermis.network/live/camera-03/master.m3u8',
        description: 'Camera khu vực học sinh',
      },
    ],
    teacher: teacher1._id,
    students: students.map((s) => s._id),
    ermisChannelId: '', // Fill with actual Ermis channel ID
    ermisChannelType: 'team',
    isActive: true,
  });

  await Classroom.create({
    name: 'Vật Lý 11B - Buổi chiều',
    description: 'Lớp học Vật Lý thực nghiệm',
    cameras: [
      {
        name: 'Camera 1 - Phòng thí nghiệm',
        url: 'https://classroom-mediaserver.ermis.network/live/camera-01/master.m3u8',
        description: 'Camera phòng thí nghiệm',
      },
      {
        name: 'Camera 2 - Bảng',
        url: 'https://classroom-mediaserver.ermis.network/live/camera-02/master.m3u8',
        description: 'Camera bảng giảng',
      },
      {
        name: 'Camera 3 - Toàn cảnh',
        url: 'https://classroom-mediaserver.ermis.network/live/camera-03/master.m3u8',
        description: 'Camera toàn cảnh',
      },
    ],
    teacher: teacher2._id,
    students: students.slice(0, 3).map((s) => s._id),
    ermisChannelId: '',
    ermisChannelType: 'team',
    isActive: true,
  });

  console.log('\n✅ Seed completed successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Created accounts:');
  console.log('   Admin:    admin / admin123');
  console.log('   Teacher:  teacher01 / teacher123');
  console.log('   Teacher:  teacher02 / teacher123');
  console.log('   Students: student01-05 / student123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  process.exit(0);
};

seedData().catch((error) => {
  console.error('❌ Seed error:', error);
  process.exit(1);
});
