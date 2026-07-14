import mongoose from 'mongoose';
import { User } from './src/models/User';
import dotenv from 'dotenv';

dotenv.config();

const updateAdminToken = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/class-demo');
    console.log('Connected to DB');

    const admin = await User.findOne({ username: 'admin' });
    if (admin) {
      admin.ermisUserId = 'class-admin';
      admin.ermisToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRldi1yczI1Ni1rZXktMSJ9.eyJyb2xlIjoiYWRtaW4iLCJ1c2VyX2lkIjoiY2xhc3MtYWRtaW4iLCJzdWIiOiJjbGFzcy1hZG1pbiIsImlzcyI6Imp3dC1yczI1Ni10ZXN0LWFwcCIsImF1ZCI6ImV4dGVybmFsLWF1dGgtdGVzdCIsImlhdCI6MTc4NDAyNDY1NiwiZXhwIjoxNzg0MDMwNjU2fQ.DWQGanZRpaqnwRQGBKDlZzc6fFexiWxW0XtKJt1ecpNZDkg-517So4MG3TAVWI1Jp4S29F-KG6yt7XCzZXd1FJ3C615gMK9VVa-YMJn6CFQHBk3_4P1VsBetFHCly4rRC6SUA3EjrfEzza3ojnWBojjPzuN5bzICWLT3mKK1TJ7VvBUUOMn-Zm0Ai1LCkne6p5PPfvCGq00wmH4wHF9KGELZzEsHEFG68lY9V833TUvNNBFgkx3LTOD9DrrPRTAWCjAGgcjmAYFeiUp8cjSCToOcK1cVrpH48eeAglUr-NuqPNAkY4iZxoKwITNf8VXLmqAT7pq3qN7CFn0rWiX10A';
      await admin.save();
      console.log('Successfully updated admin with Ermis credentials!');
    } else {
      console.log('Admin user not found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

updateAdminToken();
