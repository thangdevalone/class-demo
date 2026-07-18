import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ICamera {
  cameraId: string;
  name: string;
  url: string;
  description?: string;
}

export interface ITeacherStream {
  streamId: string;
  masterUrl: string;
  ingestUrl: string;
  serverUrl: string;
  streamKey: string;
}

export interface IRaiseHand {
  student: Types.ObjectId;
  timestamp: Date;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  dmChannelCid?: string;
}

export interface IClassroom extends Document {
  name: string;
  description: string;
  cameras: ICamera[];
  teacher: Types.ObjectId;
  students: Types.ObjectId[];
  ermisChannelId: string;
  ermisChannelType: string;
  teacherStream: ITeacherStream | null;
  raiseHandQueue: IRaiseHand[];
  isActive: boolean;
  mediaRoomId: string;
  mediaRoomName: string;
  classStatus: 'idle' | 'live' | 'ended';
  createdAt: Date;
  updatedAt: Date;
}

const cameraSchema = new Schema<ICamera>(
  {
    cameraId: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { _id: false },
);

const raiseHandSchema = new Schema<IRaiseHand>(
  {
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'completed'],
      default: 'pending',
    },
    dmChannelCid: { type: String, default: '' },
  },
  { _id: true },
);

const teacherStreamSchema = new Schema<ITeacherStream>(
  {
    streamId: { type: String, required: true },
    masterUrl: { type: String, required: true },
    ingestUrl: { type: String, default: '' },
    serverUrl: { type: String, default: '' },
    streamKey: { type: String, default: '' },
  },
  { _id: false },
);

const classroomSchema = new Schema<IClassroom>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    cameras: {
      type: [cameraSchema],
      default: [],
    },
    teacher: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    students: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    ermisChannelId: {
      type: String,
      default: '',
    },
    ermisChannelType: {
      type: String,
      default: 'team',
    },
    teacherStream: {
      type: teacherStreamSchema,
      default: null,
    },
    raiseHandQueue: {
      type: [raiseHandSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    mediaRoomId: {
      type: String,
      default: '',
    },
    mediaRoomName: {
      type: String,
      default: '',
    },
    classStatus: {
      type: String,
      enum: ['idle', 'live', 'ended'],
      default: 'idle',
    },
  },
  {
    timestamps: true,
  },
);

export const Classroom = mongoose.model<IClassroom>('Classroom', classroomSchema);
