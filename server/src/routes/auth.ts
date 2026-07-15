import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { User } from '../models/User';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

export async function generateExternalErmisToken(userId: string, role: string) {
  try {
    const res = await axios.post('https://3003-dev-server-01.ermis.network/api/token', {
      user_id: userId,
      sub: userId,
      iss: 'jwt-rs256-test-app',
      aud: 'external-auth-test',
      expiresInMinutes: 60,
      customClaims: { role }
    });
    return res.data.token;
  } catch (error: any) {
    console.error('Failed to generate external Ermis token:', error?.response?.data || error?.message);
    return null;
  }
}

export async function generateErmisToken(userId: string, role: string) {
  try {
    // 1. Get the external JWT token
    const externalToken = await generateExternalErmisToken(userId, role);
    if (!externalToken) return null;

    // 2. Exchange external token for Ermis SDK token
    const apiKey = process.env.ERMIS_API_KEY || 'q9cxPBAgawX6OP6nXKHa89NZzoEuyqlf';
    const baseUrl = process.env.ERMIS_BASE_URL || 'https://api-test.ermis.network';
    
    const exchangeRes = await axios.get(`${baseUrl}/uss/v1/get_token/external_auth?apikey=${apiKey}`, {
      headers: {
        Authorization: `Bearer ${externalToken}`
      }
    });

    return {
      token: exchangeRes.data.token,
      userId: exchangeRes.data.user_id
    };
  } catch (error: any) {
    console.error('Failed to exchange Ermis token:', error?.response?.data || error?.message);
    return null;
  }
}

// POST /api/auth/signup - public registration for students
router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, displayName } = req.body;

    if (!username || !password || !displayName) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }

    const user = new User({
      username: username.toLowerCase(),
      password,
      displayName,
      role: 'student', // default role
    });

    await user.save();

    const secret = process.env.JWT_SECRET || 'class-demo-secret';
    const token = jwt.sign({ userId: user._id, role: user.role }, secret, { expiresIn: '7d' });

    const ermisData = await generateErmisToken(user.username, user.role);
    if (ermisData) {
      user.ermisUserId = ermisData.userId;
      user.ermisToken = ermisData.token;
      await user.save();
    }

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        ermisUserId: user.ermisUserId,
        ermisToken: user.ermisToken,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const secret = process.env.JWT_SECRET || 'class-demo-secret';
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      secret,
      { expiresIn: '7d' },
    );

    const ermisData = await generateErmisToken(user.username, user.role);
    if (ermisData) {
      user.ermisUserId = ermisData.userId;
      user.ermisToken = ermisData.token;
      await user.save();
    }

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        avatar: user.avatar,
        ermisUserId: user.ermisUserId,
        ermisToken: user.ermisToken,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me — get current user info
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ermisData = await generateErmisToken(req.user!.username, req.user!.role);
    if (ermisData && ermisData.token !== req.user!.ermisToken) {
      req.user!.ermisUserId = ermisData.userId;
      req.user!.ermisToken = ermisData.token;
      await req.user!.save();
    }

    res.json({
      user: {
        id: req.user!._id,
        username: req.user!.username,
        displayName: req.user!.displayName,
        role: req.user!.role,
        avatar: req.user!.avatar,
        ermisUserId: req.user!.ermisUserId,
        ermisToken: req.user!.ermisToken,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/users — list all users (admin only)
router.get('/users', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const users = await User.find().select('-password').sort({ role: 1, displayName: 1 });
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/register — create user (admin only)
router.post('/register', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { username, password, displayName, role, ermisUserId, ermisToken } = req.body;

    if (!username || !password || !displayName || !role) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }

    const user = new User({
      username: username.toLowerCase(),
      password,
      displayName,
      role,
      ermisUserId: ermisUserId || '',
      ermisToken: ermisToken || '',
    });

    await user.save();

    res.status(201).json({
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        ermisUserId: user.ermisUserId,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/users/:id — delete user (admin only)
router.delete('/users/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (targetUser.username === 'admin') {
      res.status(400).json({ error: 'Cannot delete admin account' });
      return;
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/users/:id — update user (admin only)
router.put('/users/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { password, displayName, role, ermisUserId, ermisToken } = req.body;
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (targetUser.username === 'admin' && role !== 'admin') {
      res.status(400).json({ error: 'Cannot change admin role' });
      return;
    }

    if (displayName) targetUser.displayName = displayName;
    if (role) targetUser.role = role;
    if (password) targetUser.password = password; // mongoose hook will hash it
    if (ermisUserId !== undefined) targetUser.ermisUserId = ermisUserId;
    if (ermisToken !== undefined) targetUser.ermisToken = ermisToken;

    await targetUser.save();

    res.json({
      user: {
        id: targetUser._id,
        username: targetUser.username,
        displayName: targetUser.displayName,
        role: targetUser.role,
      },
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
