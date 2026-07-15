import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { classroomAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { Hand, CheckCircle2, PhoneCall, X, HandHeart } from 'lucide-react';

interface RaiseHandProps {
  classroomId: string;
  isTeacher: boolean;
  teacher: { _id: string; displayName: string; ermisUserId?: string };
}

interface HandEntry {
  _id: string;
  student: {
    _id: string;
    displayName: string;
    username: string;
    avatar?: string;
  };
  timestamp: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  dmChannelCid?: string;
}

export default function RaiseHand({ classroomId, isTeacher, teacher }: RaiseHandProps) {
  const { user } = useAuth();
  const [hands, setHands] = useState<HandEntry[]>([]);
  const [myHand, setMyHand] = useState<HandEntry | null>(null);
  const [isRaising, setIsRaising] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Fetch initial hand status
  const fetchHands = useCallback(async () => {
    try {
      if (isTeacher) {
        const res = await classroomAPI.getHands(classroomId);
        setHands(res.data.hands || []);
      } else {
        const res = await classroomAPI.getMyHand(classroomId);
        setMyHand(res.data.hand || null);
      }
    } catch (err) {
      // Silent fail
    }
  }, [classroomId, isTeacher]);

  // Connect to socket for real-time updates
  useEffect(() => {
    fetchHands();
    
    // Connect to server socket
    const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    socketRef.current = io(socketUrl, { withCredentials: true });
    const socket = socketRef.current;

    socket.on('connect', () => {
      socket.emit('join_classroom', classroomId);
    });

    socket.on('hand_raised', () => {
      if (isTeacher) fetchHands();
    });

    socket.on('hand_cancelled', () => {
      if (isTeacher) fetchHands();
    });

    socket.on('hand_accepted', (data: any) => {
      if (isTeacher) fetchHands();
      if (!isTeacher && user?.username === data.studentErmisId) {
        setMyHand(prev => prev ? { ...prev, status: 'accepted' } : null);
        console.log('Hand accepted by teacher!');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchHands, classroomId, isTeacher, user?.username]);

  // Student: Raise hand
  const handleRaiseHand = async () => {
    setIsRaising(true);
    try {
      await classroomAPI.raiseHand(classroomId);
      await fetchHands();
      socketRef.current?.emit('raise_hand', { classroomId });
    } catch (err: any) {
      console.error('Raise hand error:', err);
      alert(err.response?.data?.error || 'Không thể giơ tay');
    } finally {
      setIsRaising(false);
    }
  };

  // Student: Cancel hand
  const handleCancelHand = async () => {
    setIsCancelling(true);
    try {
      await classroomAPI.cancelHand(classroomId);
      setMyHand(null);
      socketRef.current?.emit('cancel_hand', { classroomId });
    } catch (err: any) {
      console.error('Cancel hand error:', err);
    } finally {
      setIsCancelling(false);
    }
  };

  // Teacher: Accept hand → will trigger DM call
  const handleAcceptHand = async (studentId: string, studentUsername: string) => {
    try {
      const dmChannelCid = ''; 
      await classroomAPI.acceptHand(classroomId, studentId, dmChannelCid);
      await fetchHands();
      
      // Notify student and start call
      socketRef.current?.emit('accept_hand', { classroomId, studentErmisId: studentUsername });
      
      // Initiate Ermis Call via event
      window.dispatchEvent(new CustomEvent('start_dm_call', { 
        detail: { studentErmisId: studentUsername } 
      }));
    } catch (err: any) {
      console.error('Accept hand error:', err);
    }
  };

  // Teacher: Reject hand
  const handleRejectHand = async (studentId: string) => {
    try {
      await classroomAPI.rejectHand(classroomId, studentId);
      await fetchHands();
    } catch (err: any) {
      console.error('Reject hand error:', err);
    }
  };

  // Student: When hand is accepted → initiate call
  useEffect(() => {
    if (!isTeacher && myHand?.status === 'accepted') {
      // Hand was accepted! Student should now initiate a call to the teacher
      // This would use the ErmisCallProvider's createCall method
      // For now, show a notification
      console.log('Hand accepted! Ready to call teacher.');
    }
  }, [isTeacher, myHand]);

  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Re-render every 5 seconds to update relative time
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  // Helper: time ago
  const timeAgo = (timestamp: string) => {
    // Just reference `tick` to ensure React re-evaluates this function
    const _forceUpdate = tick;
    const diff = Date.now() - new Date(timestamp).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s trước`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m trước`;
    return `${Math.floor(minutes / 60)}h trước`;
  };

  const pendingHands = hands.filter((h) => h.status === 'pending');
  const acceptedHands = hands.filter((h) => h.status === 'accepted');

  // ==================== STUDENT VIEW ====================
  if (!isTeacher) {
    return (
      <div className="flex flex-col border-b border-slate-200 bg-white p-4">
        {!myHand ? (
          <Button
            className="w-full gap-2 font-semibold bg-amber-500 hover:bg-amber-600 text-amber-950"
            onClick={handleRaiseHand}
            disabled={isRaising}
          >
            {isRaising ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-950 border-t-transparent" />
                Đang giơ tay...
              </>
            ) : (
              <>
                <Hand className="h-5 w-5" /> Giơ tay phát biểu
              </>
            )}
          </Button>
        ) : myHand.status === 'pending' ? (
          <div className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
            <div className="flex items-center gap-3">
              <Hand className="h-6 w-6 animate-pulse text-amber-500" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-amber-500">Đang chờ giáo viên...</span>
                <span className="text-[10px] text-amber-500/70">Đã giơ tay {timeAgo(myHand.timestamp)}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-amber-500 hover:bg-amber-500/20 hover:text-amber-400 px-2"
              onClick={handleCancelHand}
              disabled={isCancelling}
            >
              {isCancelling ? '...' : <X className="h-4 w-4" />}
            </Button>
          </div>
        ) : myHand.status === 'accepted' ? (
          <div className="flex flex-col gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-emerald-500">Giáo viên đã gọi bạn!</span>
                <span className="text-[10px] text-emerald-500/70">Hãy nhấn nút bên dưới để kết nối thoại.</span>
              </div>
            </div>
            <Button className="w-full gap-2 bg-emerald-500 text-white hover:bg-emerald-600">
              <PhoneCall className="h-4 w-4" /> Gọi giáo viên
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  // ==================== TEACHER VIEW ====================
  return (
    <div className="flex flex-col border-b border-slate-200 bg-white max-h-64 overflow-y-auto hide-scrollbar">
      <div className="sticky top-0 bg-white/95 backdrop-blur z-10 flex items-center gap-2 p-3 border-b border-slate-200">
        <HandHeart className="h-4 w-4 text-amber-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
          Học sinh giơ tay ({pendingHands.length} chờ{acceptedHands.length > 0 ? `, ${acceptedHands.length} đang gọi` : ''})
        </span>
      </div>

      {pendingHands.length === 0 && acceptedHands.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">
          Chưa có học sinh nào giơ tay
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100">
          {/* Pending hands */}
          {pendingHands.map((hand) => (
            <div key={hand._id} className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  {hand.student.displayName.charAt(0)}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-700">{hand.student.displayName}</span>
                  <span className="text-[10px] text-slate-500">{timeAgo(hand.timestamp)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  size="sm" 
                  variant="default" 
                  className="bg-emerald-500 hover:bg-emerald-600 font-medium"
                  onClick={() => handleAcceptHand(hand.student._id, hand.student.username)}
                >
                  Chấp nhận & Gọi
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                  onClick={() => handleRejectHand(hand.student._id)}
                  title="Từ chối"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {/* Accepted hands */}
          {acceptedHands.map((hand) => (
            <div key={hand._id} className="flex items-center justify-between p-3 bg-emerald-500/5 border-l-2 border-emerald-500">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
                  <PhoneCall className="h-4 w-4 animate-pulse" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-emerald-500">{hand.student.displayName}</span>
                  <span className="text-[10px] text-emerald-500/70">Đang trong cuộc gọi</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
