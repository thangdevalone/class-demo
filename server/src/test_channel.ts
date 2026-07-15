import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { ermisChatService } from './services/ErmisChatService';
import connectDB from './config/db';

async function test() {
  await connectDB();
  
  try {
    console.log('Testing createClassChannel...');
    const classId = new mongoose.Types.ObjectId().toString();
    const cid = await ermisChatService.createClassChannel('Test Class', 'Desc', ['user_test_001']);
    console.log('Success, created channel:', cid);
    
    console.log('Testing addMembersToClass...');
    await ermisChatService.addMembersToClass(cid, ['user_test_002']);
    console.log('Success added member');
  } catch (error) {
    console.error('Test failed', error);
  } finally {
    process.exit(0);
  }
}

test();
