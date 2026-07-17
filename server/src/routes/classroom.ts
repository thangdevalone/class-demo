import { Router, Request, Response } from 'express';
import { Classroom } from '../models/Classroom';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { ermisChatService } from '../services/ErmisChatService';

const router = Router();

// GET /api/classrooms/public/browse — public browse for unauthenticated users
router.get('/public/browse', async (req: Request, res: Response): Promise<void> => {
  try {
    const classrooms = await Classroom.find({ isActive: true })
      .populate('teacher', 'displayName username avatar role')
      .select('name description teacher startTime endTime students cameras isActive')
      .sort({ startTime: 1 });

    const result = classrooms.map((c) => ({
      _id: c._id,
      name: c.name,
      description: c.description,
      teacher: c.teacher,
      startTime: c.startTime,
      endTime: c.endTime,
      studentCount: c.students.length,
      cameraCount: c.cameras.length,
      isActive: c.isActive,
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
      .sort({ startTime: 1 });

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
      .select('name description teacher startTime endTime students cameras isActive')
      .sort({ startTime: 1 });

    // Return with studentCount instead of full student list for privacy
    const result = classrooms.map((c) => ({
      _id: c._id,
      name: c.name,
      description: c.description,
      teacher: c.teacher,
      startTime: c.startTime,
      endTime: c.endTime,
      studentCount: c.students.length,
      cameraCount: c.cameras.length,
      isActive: c.isActive,
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
// POST /api/classrooms — create classroom (admin only)
router.post(
  '/',
  authorize('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { name, description, cameras, teacherId, studentIds, startTime, endTime } = req.body;

      if (!name) {
        res.status(400).json({ error: 'Classroom name is required' });
        return;
      }
      if (!teacherId) {
        res.status(400).json({ error: 'Teacher is required' });
        return;
      }
      if (!startTime || !endTime) {
        res.status(400).json({ error: 'Start and end time are required' });
        return;
      }

      const classroom = new Classroom({
        name,
        description: description || '',
        cameras: cameras || [],
        teacher: teacherId,
        students: studentIds || [],
        startTime: new Date(startTime),
        endTime: new Date(endTime),
      });
      
      // Channel ID will be set after creation

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
        // Do we fail classroom creation? Usually yes or log and proceed. We'll proceed for robustness.
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
      const { name, description, cameras, teacherId, studentIds, startTime, endTime, isActive } = req.body;
      const update: any = {};

      if (name) update.name = name;
      if (description !== undefined) update.description = description;
      if (cameras) update.cameras = cameras;
      if (teacherId) update.teacher = teacherId;
      if (studentIds) update.students = studentIds;
      if (startTime) update.startTime = new Date(startTime);
      if (endTime) update.endTime = new Date(endTime);
      if (isActive !== undefined) update.isActive = isActive;

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
      const classroom = await Classroom.findByIdAndDelete(req.params.id);
      if (!classroom) {
        res.status(404).json({ error: 'Classroom not found' });
        return;
      }
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

export default router;
