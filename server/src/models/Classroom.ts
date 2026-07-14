import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ICamera {
  name: string;
  url: string;
  description?: string;
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
  raiseHandQueue: IRaiseHand[];
  isActive: boolean;
  startTime: Date;
  endTime: Date;
  createdAt: Date;
  updatedAt: Date;
}

const cameraSchema = new Schema<ICamera>(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
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
    raiseHandQueue: {
      type: [raiseHandSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const Classroom = mongoose.model<IClassroom>('Classroom', classroomSchema);
