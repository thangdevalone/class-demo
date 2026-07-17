import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWhiteboardData extends Document {
  user: Types.ObjectId;
  classroom: Types.ObjectId;
  elements: any[];
  appState: Record<string, any>;
  files: Record<string, any>;
  updatedAt: Date;
  createdAt: Date;
}

const whiteboardDataSchema = new Schema<IWhiteboardData>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    classroom: {
      type: Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true,
    },
    elements: {
      type: Schema.Types.Mixed,
      default: [],
    },
    appState: {
      type: Schema.Types.Mixed,
      default: {},
    },
    files: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

// Unique index: one whiteboard per user per classroom
whiteboardDataSchema.index({ user: 1, classroom: 1 }, { unique: true });

export const WhiteboardData = mongoose.model<IWhiteboardData>('WhiteboardData', whiteboardDataSchema);
