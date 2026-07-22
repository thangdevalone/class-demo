import { Router, Request, Response } from 'express';
import { Classroom } from '../models/Classroom';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { ermisChatService } from '../services/ErmisChatService';
import { WhiteboardData } from '../models/WhiteboardData';
import { getIO } from '../socket';

const router = Router();

const MEDIA_SERVER_URL = 'https://ms-motix.ermis.network';

// ==================== MEDIA SERVER PROXY ====================

// GET /api/classrooms/media/rooms — list media server rooms
router.get('/media/rooms', authenticate, authorize('admin', 'teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const url = `${MEDIA_SERVER_URL}/rooms`;
    console.log(`[Media Proxy] Fetching rooms from: ${url}`);
    const response = await fetch(url);
    console.log(`[Media Proxy] Response status: ${response.status}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Media Proxy] Error response body:`, errorText);
      res.status(response.status).json({ error: 'Failed to fetch rooms from media server' });
      return;
    }
    const rooms = await response.json();
    console.log(`[Media Proxy] Fetched ${Array.isArray(rooms) ? rooms.length : 'N/A'} rooms`);
    res.json({ rooms });
  } catch (error: any) {
    console.error('[Media Proxy] Fetch media rooms error:', error.message || error);
    res.status(500).json({ error: 'Failed to connect to media server' });
  }
});

// GET /api/classrooms/media/rooms/:roomId/cameras — list cameras in a room
router.get('/media/rooms/:roomId/cameras', authenticate, authorize('admin', 'teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const response = await fetch(`${MEDIA_SERVER_URL}/rooms/${req.params.roomId}/cameras`);
    if (!response.ok) {
      res.status(response.status).json({ error: 'Failed to fetch cameras from media server' });
      return;
    }
    const cameras = await response.json();
    res.json({ cameras });
  } catch (error) {
    console.error('Fetch media cameras error:', error);
    res.status(500).json({ error: 'Failed to connect to media server' });
  }
});

// ==================== PUBLIC ROUTES ====================

// GET /api/classrooms/public/browse — public browse for unauthenticated users
router.get('/public/browse', async (req: Request, res: Response): Promise<void> => {
  try {
    const classrooms = await Classroom.find({ isActive: true })
      .populate('teacher', 'displayName username avatar role')
      .select('name description teacher students cameras isActive classStatus mediaRoomId mediaRoomName')
      .sort({ createdAt: -1 });

    const result = classrooms.map((c) => ({
      _id: c._id,
      name: c.name,
      description: c.description,
      teacher: c.teacher,
      studentCount: c.students.length,
      cameraCount: c.cameras.length,
      isActive: c.isActive,
      classStatus: c.classStatus,
      mediaRoomName: c.mediaRoomName,
      isRegistered: false,
    }));

    res.json({ classrooms: result });
  } catch (error) {
    console.error('Public browse error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// All routes below require authentication
router.use(authenticate);

// GET /api/classrooms — list classrooms for current user
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    let query: any = {};

    if (user.role === 'teacher') {
      query = { teacher: user._id };
    } else if (user.role === 'student') {
      query = { students: user._id };
    }
    // admin sees all

    const classrooms = await Classroom.find(query)
      .populate('teacher', 'displayName username avatar role')
      .populate('students', 'displayName username avatar role')
      .sort({ createdAt: -1 });

    res.json({ classrooms });
  } catch (error) {
    console.error('List classrooms error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/classrooms/browse — browse all classrooms (students finding classes to register)
router.get('/browse', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const classrooms = await Classroom.find({ isActive: true })
      .populate('teacher', 'displayName username avatar role')
      .select('name description teacher students cameras isActive classStatus mediaRoomId mediaRoomName')
      .sort({ createdAt: -1 });

    // Return with studentCount instead of full student list for privacy
    const result = classrooms.map((c) => ({
      _id: c._id,
      name: c.name,
      description: c.description,
      teacher: c.teacher,
      studentCount: c.students.length,
      cameraCount: c.cameras.length,
      isActive: c.isActive,
      classStatus: c.classStatus,
      mediaRoomName: c.mediaRoomName,
      isRegistered: c.students.some((s) => s.toString() === req.user!._id.toString()),
    }));

    res.json({ classrooms: result });
  } catch (error) {
    console.error('Browse classrooms error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/classrooms/:id — get classroom detail
// Auto-registers students who access via direct link
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let classroom = await Classroom.findById(req.params.id);

    if (!classroom) {
      res.status(404).json({ error: 'Classroom not found' });
      return;
    }

    // Auto-register student if they access via direct link and aren't registered yet
    const user = req.user;
    if (user && user.role === 'student') {
      const alreadyRegistered = classroom.students.some(
        (s) => s.toString() === user._id.toString(),
      );
      if (!alreadyRegistered) {
        console.log(`[Classroom] Auto-registering student ${user.username} (${user._id}) into classroom ${classroom.name}`);
        classroom.students.push(user._id);
        await classroom.save();

        // Also add to Ermis chat channel
        if (classroom.ermisChannelId && user.ermisUserId) {
          try {
            await ermisChatService.addMembersToClass(classroom.ermisChannelId, [user.ermisUserId]);
            console.log(`[Classroom] Auto-added student ${user.username} to Ermis channel ${classroom.ermisChannelId}`);
          } catch (chatError) {
            console.error('[Classroom] Failed to auto-add student to Ermis channel:', chatError);
          }
        }
      }
    }

    // Re-populate after potential modification
    classroom = await Classroom.findById(req.params.id)
      .populate('teacher', 'displayName username avatar role ermisUserId')
      .populate('students', 'displayName username avatar role ermisUserId')
      .populate('raiseHandQueue.student', 'displayName username avatar ermisUserId');

    if (!classroom) {
      res.status(404).json({ error: 'Classroom not found' });
      return;
    }

    res.json({ classroom });
  } catch (error) {
    console.error('Get classroom error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/classrooms/:id/ensure-chat-membership — make current user a real Ermis channel member
router.post('/:id/ensure-chat-membership', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) {
      res.status(404).json({ error: 'Classroom not found' });
      return;
    }

    const user = req.user!;
    const isTeacher = classroom.teacher.toString() === user._id.toString();
    const isStudent = classroom.students.some((s) => s.toString() === user._id.toString());
    const isAdmin = user.role === 'admin';

    if (!isAdmin && !isTeacher && !isStudent) {
      res.status(403).json({ error: 'You are not in this classroom' });
      return;
    }

    if (!classroom.ermisChannelId) {
      res.status(400).json({ error: 'Classroom chat channel is not configured' });
      return;
    }

    if (!user.ermisUserId) {
      res.status(400).json({ error: 'Current user does not have an Ermis user id' });
      return;
    }

    await ermisChatService.addMembersToClass(classroom.ermisChannelId, [user.ermisUserId]);
    res.json({ message: 'Chat membership ensured' });
  } catch (error) {
    console.error('Ensure chat membership error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== CLASS CONTROL (TEACHER) ====================

// POST /api/classrooms/:id/start-class — teacher starts the class
router.post(
  '/:id/start-class',
  authorize('teacher', 'admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const classroom = await Classroom.findById(req.params.id);
      if (!classroom) {
        res.status(404).json({ error: 'Classroom not found' });
        return;
      }

      // Only the assigned teacher or admin can start
      const user = req.user!;
      const isTeacher = classroom.teacher.toString() === user._id.toString();
      const isAdmin = user.role === 'admin';
      if (!isTeacher && !isAdmin) {
        res.status(403).json({ error: 'Only the assigned teacher can start this class' });
        return;
      }

      if (!classroom.mediaRoomId) {
        res.status(400).json({ error: 'No media room assigned to this classroom' });
        return;
      }

      // Call media server to start the room
      console.log(`[Classroom] Starting media room: ${classroom.mediaRoomId}`);
      let startResponse = await fetch(`${MEDIA_SERVER_URL}/rooms/${classroom.mediaRoomId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcode_mode: true }),
      });

      // If room is already running, auto-stop then retry start
      if (!startResponse.ok) {
        const errorText = await startResponse.text();
        const isAlreadyRunning = errorText.includes('room already running');

        if (isAlreadyRunning) {
          console.log(`[Classroom] Room already running, auto-stopping first...`);
          try {
            const stopResponse = await fetch(`${MEDIA_SERVER_URL}/rooms/${classroom.mediaRoomId}/stop`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            if (!stopResponse.ok) {
              console.error(`[Classroom] Auto-stop failed:`, await stopResponse.text());
            } else {
              console.log(`[Classroom] Auto-stop successful, retrying start...`);
            }
          } catch (stopError) {
            console.error('[Classroom] Error during auto-stop:', stopError);
          }

          // Retry start after stop
          startResponse = await fetch(`${MEDIA_SERVER_URL}/rooms/${classroom.mediaRoomId}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcode_mode: true }),
          });

          if (!startResponse.ok) {
            const retryErrorText = await startResponse.text();
            console.error(`[Classroom] Media server start failed after retry:`, retryErrorText);
            res.status(500).json({ error: 'Failed to start media room after auto-restart' });
            return;
          }
        } else {
          console.error(`[Classroom] Media server start failed:`, errorText);
          res.status(500).json({ error: 'Failed to start media room' });
          return;
        }
      }

      const startData: any = await startResponse.json();
      console.log(`[Classroom] Media room started, streams:`, JSON.stringify(startData.streams?.length || 0));

      // Update cameras with master_url from response
      if (startData.streams && Array.isArray(startData.streams)) {
        classroom.cameras = startData.streams.map((stream: any) => ({
          cameraId: stream.camera_id,
          name: stream.camera_id,
          url: stream.master_url,
          description: '',
        }));
      }

      // Save teacher stream (audio + video)
      if (startData.teacher_stream) {
        classroom.teacherStream = {
          streamId: startData.teacher_stream.stream_id || '',
          masterUrl: startData.teacher_stream.master_url || '',
          ingestUrl: startData.teacher_stream.ingest_url || '',
          serverUrl: startData.teacher_stream.server_url || '',
          streamKey: startData.teacher_stream.stream_key || '',
        };
      } else {
        classroom.teacherStream = null;
      }

      classroom.classStatus = 'live';
      await classroom.save();

      // Emit socket event to notify students
      getIO().to(`classroom_${classroom._id}`).emit('class_started', {
        classroomId: classroom._id,
        cameras: classroom.cameras,
        teacherStream: classroom.teacherStream,
      });

      await classroom.populate('teacher', 'displayName username avatar role ermisUserId');
      await classroom.populate('students', 'displayName username avatar role ermisUserId');

      res.json({ classroom, message: 'Class started successfully' });
    } catch (error) {
      console.error('Start class error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },
);

// POST /api/classrooms/:id/end-class — teacher ends the class
router.post(
  '/:id/end-class',
  authorize('teacher', 'admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const classroom = await Classroom.findById(req.params.id);
      if (!classroom) {
        res.status(404).json({ error: 'Classroom not found' });
        return;
      }

      // Only the assigned teacher or admin can end
      const user = req.user!;
      const isTeacher = classroom.teacher.toString() === user._id.toString();
      const isAdmin = user.role === 'admin';
      if (!isTeacher && !isAdmin) {
        res.status(403).json({ error: 'Only the assigned teacher can end this class' });
        return;
      }

      // Call media server to stop the room
      if (classroom.mediaRoomId) {
        console.log(`[Classroom] Stopping media room: ${classroom.mediaRoomId}`);
        try {
          const stopResponse = await fetch(`${MEDIA_SERVER_URL}/rooms/${classroom.mediaRoomId}/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (!stopResponse.ok) {
            console.error(`[Classroom] Media server stop failed:`, await stopResponse.text());
          }
        } catch (stopError) {
          console.error('[Classroom] Error stopping media room:', stopError);
        }
      }

      classroom.classStatus = 'ended';
      // Clear camera URLs since streams are stopped
      classroom.cameras = classroom.cameras.map((cam: any) => ({
        cameraId: cam.cameraId,
        name: cam.name,
        url: '',
        description: cam.description || '',
      })) as any;
      // Clear teacher stream
      classroom.teacherStream = null;
      await classroom.save();

      // Emit socket event to notify students
      getIO().to(`classroom_${classroom._id}`).emit('class_ended', {
        classroomId: classroom._id,
      });

      // Also clear raise hand queue
      classroom.raiseHandQueue = [] as any;
      await classroom.save();

      res.json({ message: 'Class ended successfully' });
    } catch (error) {
      console.error('End class error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },
);

// ==================== CRUD ====================

// POST /api/classrooms — create classroom (admin only)
router.post(
  '/',
  authorize('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { name, description, teacherId, studentIds, mediaRoomId, mediaRoomName } = req.body;

      if (!name) {
        res.status(400).json({ error: 'Classroom name is required' });
        return;
      }
      if (!teacherId) {
        res.status(400).json({ error: 'Teacher is required' });
        return;
      }

      // Fetch cameras from media server room if mediaRoomId is provided
      let cameras: any[] = [];
      if (mediaRoomId) {
        try {
          const camResponse = await fetch(`${MEDIA_SERVER_URL}/rooms/${mediaRoomId}/cameras`);
          if (camResponse.ok) {
            const camData = await camResponse.json();
            if (Array.isArray(camData)) {
              cameras = camData.map((cam: any) => ({
                cameraId: cam.camera_id || cam.id,
                name: cam.name || cam.camera_id || cam.id,
                url: '', // URL will be filled when teacher starts the class
                description: cam.description || '',
              }));
            }
          }
        } catch (camError) {
          console.error('Failed to fetch cameras from media server:', camError);
        }
      }

      const classroom = new Classroom({
        name,
        description: description || '',
        cameras,
        teacher: teacherId,
        students: studentIds || [],
        mediaRoomId: mediaRoomId || '',
        mediaRoomName: mediaRoomName || '',
        classStatus: 'idle',
      });

      await classroom.save();
      await classroom.populate('teacher', 'displayName username avatar role ermisUserId');
      await classroom.populate('students', 'displayName username avatar role ermisUserId');

      // Add to Ermis channel
      try {
        const teacher = classroom.teacher as any;
        const students = classroom.students as any[];
        
        const memberIds = [];
        if (teacher && teacher.ermisUserId) memberIds.push(teacher.ermisUserId);
        students.forEach(s => {
          if (s.ermisUserId) memberIds.push(s.ermisUserId);
        });

        const cid = await ermisChatService.createClassChannel(
          classroom.name,
          classroom.description,
          memberIds
        );
        classroom.ermisChannelId = cid;
        classroom.ermisChannelType = 'meeting';
        await classroom.save();
      } catch (chatError) {
        console.error('Failed to create Ermis chat channel:', chatError);
      }

      res.status(201).json({ classroom });
    } catch (error) {
      console.error('Create classroom error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },
);

// PUT /api/classrooms/:id — update classroom (admin only)
router.put(
  '/:id',
  authorize('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { name, description, teacherId, studentIds, mediaRoomId, mediaRoomName, isActive } = req.body;
      const update: any = {};

      if (name) update.name = name;
      if (description !== undefined) update.description = description;
      if (teacherId) update.teacher = teacherId;
      if (studentIds) update.students = studentIds;
      if (mediaRoomId !== undefined) update.mediaRoomId = mediaRoomId;
      if (mediaRoomName !== undefined) update.mediaRoomName = mediaRoomName;
      if (isActive !== undefined) update.isActive = isActive;

      // If mediaRoomId changed, re-fetch cameras
      if (mediaRoomId) {
        try {
          const camResponse = await fetch(`${MEDIA_SERVER_URL}/rooms/${mediaRoomId}/cameras`);
          if (camResponse.ok) {
            const camData = await camResponse.json();
            if (Array.isArray(camData)) {
              update.cameras = camData.map((cam: any) => ({
                cameraId: cam.camera_id || cam.id,
                name: cam.name || cam.camera_id || cam.id,
                url: '',
                description: cam.description || '',
              }));
            }
          }
        } catch (camError) {
          console.error('Failed to fetch cameras from media server:', camError);
        }
      }

      const classroom = await Classroom.findByIdAndUpdate(
        req.params.id,
        { $set: update },
        { new: true },
      )
        .populate('teacher', 'displayName username avatar role')
        .populate('students', 'displayName username avatar role');

      if (!classroom) {
        res.status(404).json({ error: 'Classroom not found' });
        return;
      }

      res.json({ classroom });
    } catch (error) {
      console.error('Update classroom error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },
);

// DELETE /api/classrooms/:id — delete classroom (admin only)
router.delete(
  '/:id',
  authorize('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const classroom = await Classroom.findById(req.params.id);
      if (!classroom) {
        res.status(404).json({ error: 'Classroom not found' });
        return;
      }

      // Stop media room if class is live
      if (classroom.classStatus === 'live' && classroom.mediaRoomId) {
        try {
          await fetch(`${MEDIA_SERVER_URL}/rooms/${classroom.mediaRoomId}/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          console.log(`[Classroom] Stopped media room ${classroom.mediaRoomId} before delete`);
        } catch (stopErr) {
          console.error('[Classroom] Failed to stop media room on delete:', stopErr);
        }
      }

      // Delete Ermis chat channel
      if (classroom.ermisChannelId) {
        try {
          await ermisChatService.deleteClassChannel(classroom.ermisChannelId);
          console.log(`[Classroom] Deleted Ermis channel ${classroom.ermisChannelId}`);
        } catch (chatErr) {
          console.error('[Classroom] Failed to delete Ermis channel:', chatErr);
        }
      }

      // Delete whiteboard data
      await WhiteboardData.deleteMany({ classroom: classroom._id });

      // Delete classroom
      await Classroom.findByIdAndDelete(req.params.id);

      res.json({ message: 'Classroom deleted' });
    } catch (error) {
      console.error('Delete classroom error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },
);

// POST /api/classrooms/:id/register — student self-register for a class
router.post(
  '/:id/register',
  authorize('student'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const classroom = await Classroom.findById(req.params.id);
      if (!classroom) {
        res.status(404).json({ error: 'Classroom not found' });
        return;
      }

      const alreadyRegistered = classroom.students.some(
        (s) => s.toString() === req.user!._id.toString(),
      );
      if (alreadyRegistered) {
        res.status(409).json({ error: 'Already registered' });
        return;
      }

      classroom.students.push(req.user!._id);
      await classroom.save();

      if (classroom.ermisChannelId && req.user?.ermisUserId) {
        try {
          await ermisChatService.addMembersToClass(classroom.ermisChannelId, [req.user.ermisUserId]);
        } catch (chatError) {
          console.error('Failed to add member to Ermis chat channel:', chatError);
        }
      }

      res.json({ message: 'Registered successfully' });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },
);

// POST /api/classrooms/:id/unregister — student unregister from a class
router.post(
  '/:id/unregister',
  authorize('student'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const classroom = await Classroom.findById(req.params.id);
      if (!classroom) {
        res.status(404).json({ error: 'Classroom not found' });
        return;
      }

      classroom.students = classroom.students.filter(
        (s) => s.toString() !== req.user!._id.toString(),
      ) as any;
      await classroom.save();

      if (classroom.ermisChannelId && req.user?.ermisUserId) {
        try {
          await ermisChatService.removeMembersFromClass(classroom.ermisChannelId, [req.user.ermisUserId]);
        } catch (chatError) {
          console.error('Failed to remove member from Ermis chat channel:', chatError);
        }
      }

      res.json({ message: 'Unregistered successfully' });
    } catch (error) {
      console.error('Unregister error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },
);

// ==================== RAISE HAND ====================

// POST /api/classrooms/:id/raise-hand
router.post(
  '/:id/raise-hand',
  authorize('student'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const classroom = await Classroom.findById(req.params.id);
      if (!classroom) { res.status(404).json({ error: 'Classroom not found' }); return; }

      const isStudent = classroom.students.some((s) => s.toString() === req.user!._id.toString());
      if (!isStudent) { res.status(403).json({ error: 'You are not in this classroom' }); return; }

      const existingPending = classroom.raiseHandQueue.find(
        (h) => h.student.toString() === req.user!._id.toString() && h.status === 'pending',
      );
      if (existingPending) { res.status(409).json({ error: 'Already raised' }); return; }

      classroom.raiseHandQueue.push({ student: req.user!._id, timestamp: new Date(), status: 'pending' } as any);
      await classroom.save();
      res.json({ message: 'Hand raised' });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  },
);

// POST /api/classrooms/:id/cancel-hand
router.post('/:id/cancel-hand', authorize('student'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) { res.status(404).json({ error: 'Classroom not found' }); return; }
    const idx = classroom.raiseHandQueue.findIndex(
      (h) => h.student.toString() === req.user!._id.toString() && h.status === 'pending',
    );
    if (idx === -1) { res.status(404).json({ error: 'No pending hand' }); return; }
    classroom.raiseHandQueue.splice(idx, 1);
    await classroom.save();
    res.json({ message: 'Cancelled' });
  } catch (error) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/classrooms/:id/accept-hand/:studentId
router.post('/:id/accept-hand/:studentId', authorize('teacher', 'admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { dmChannelCid } = req.body;
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) { res.status(404).json({ error: 'Classroom not found' }); return; }
    const hand = classroom.raiseHandQueue.find((h) => h.student.toString() === req.params.studentId && h.status === 'pending');
    if (!hand) { res.status(404).json({ error: 'No pending hand' }); return; }
    hand.status = 'accepted';
    hand.dmChannelCid = dmChannelCid || '';
    await classroom.save();
    res.json({ message: 'Accepted', dmChannelCid: hand.dmChannelCid });
  } catch (error) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/classrooms/:id/reject-hand/:studentId
router.post('/:id/reject-hand/:studentId', authorize('teacher', 'admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) { res.status(404).json({ error: 'Classroom not found' }); return; }
    const hand = classroom.raiseHandQueue.find((h) => h.student.toString() === req.params.studentId && h.status === 'pending');
    if (!hand) { res.status(404).json({ error: 'No pending hand' }); return; }
    hand.status = 'rejected';
    await classroom.save();
    res.json({ message: 'Rejected' });
  } catch (error) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/classrooms/:id/complete-hand/:studentId
router.post('/:id/complete-hand/:studentId', authorize('teacher', 'admin', 'student'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) { res.status(404).json({ error: 'Classroom not found' }); return; }
    const hand = classroom.raiseHandQueue.find((h) => h.student.toString() === req.params.studentId && h.status === 'accepted');
    if (hand) { hand.status = 'completed'; await classroom.save(); }
    res.json({ message: 'Completed' });
  } catch (error) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/classrooms/:id/hands
router.get('/:id/hands', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const classroom = await Classroom.findById(req.params.id).populate('raiseHandQueue.student', 'displayName username avatar ermisUserId');
    if (!classroom) { res.status(404).json({ error: 'Classroom not found' }); return; }
    const activeHands = classroom.raiseHandQueue.filter((h) => h.status === 'pending' || h.status === 'accepted');
    res.json({ hands: activeHands });
  } catch (error) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/classrooms/:id/my-hand
router.get('/:id/my-hand', authorize('student'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) { res.status(404).json({ error: 'Classroom not found' }); return; }
    const myHand = classroom.raiseHandQueue.find(
      (h) => h.student.toString() === req.user!._id.toString() && (h.status === 'pending' || h.status === 'accepted'),
    );
    res.json({ hand: myHand || null });
  } catch (error) { res.status(500).json({ error: 'Server error' }); }
});


// ==================== WHITEBOARD ====================

// GET /api/classrooms/:id/whiteboard — get whiteboard data for current user
router.get('/:id/whiteboard', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const data = await WhiteboardData.findOne({
      user: user._id,
      classroom: req.params.id,
    });

    if (!data) {
      res.json({ whiteboard: null });
      return;
    }

    res.json({
      whiteboard: {
        elements: data.elements,
        appState: data.appState,
        files: data.files,
        updatedAt: data.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get whiteboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/classrooms/:id/whiteboard — save whiteboard data for current user
router.put('/:id/whiteboard', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { elements, appState, files } = req.body;

    const data = await WhiteboardData.findOneAndUpdate(
      { user: user._id, classroom: req.params.id },
      {
        user: user._id,
        classroom: req.params.id,
        elements: elements || [],
        appState: appState || {},
        files: files || {},
      },
      { upsert: true, new: true },
    );

    res.json({
      message: 'Whiteboard saved',
      updatedAt: data.updatedAt,
    });
  } catch (error) {
    console.error('Save whiteboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
