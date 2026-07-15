import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { classroomAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { Hand, CheckCircle2, PhoneCall, X, HandHeart } from 'lucide-react';
import { useChatClient, useCallContext } from '@ermis-network/ermis-chat-react';
import type { Channel } from '@ermis-network/ermis-chat-sdk';

const CALL_USER_NAME_KEY = 'class-demo-ermis-user-name:';

function rememberCallUserName(userId?: string, name?: string) {
  if (!userId || !name || name === userId) return;
  try {
    localStorage.setItem(`${CALL_USER_NAME_KEY}${userId}`, name);
  } catch {
    // Ignore storage errors; call UI can still fall back to SDK user data.
  }
}

interface RaiseHandProps {
  classroomId: string;
  isTeacher: boolean;
  teacher: { _id?: string; displayName?: string; ermisUserId?: string };
  onPendingCountChange?: (count: number) => void;
}

interface HandEntry {
  _id: string;
  student: {
    _id: string;
    displayName: string;
    username: string;
    ermisUserId?: string;
    avatar?: string;
  };
  timestamp: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  dmChannelCid?: string;
}

export default function RaiseHand({ classroomId, isTeacher, teacher, onPendingCountChange }: RaiseHandProps) {
  const { user } = useAuth();
  const [hands, setHands] = useState<HandEntry[]>([]);
  const [myHand, setMyHand] = useState<HandEntry | null>(null);
  const [isRaising, setIsRaising] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const activeCallRef = useRef<{ studentId: string; studentErmisId: string } | null>(null);
  const pendingTeacherCallRef = useRef<{ studentId: string; studentErmisId: string; dmChannelCid: string } | null>(null);
  const watchedDirectChannelCidsRef = useRef<Set<string>>(new Set());
  const acceptingInviteByCidRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const studentReadyCidsRef = useRef<Set<string>>(new Set());
  const teacherStartedCallCidsRef = useRef<Set<string>>(new Set());
  const completedHandKeysRef = useRef<Set<string>>(new Set());
  const lastCallStatusRef = useRef<string>('');
  const { client } = useChatClient();
  const { createCall, endCall, callStatus, callNode, resetCall } = useCallContext();

  const [initialFetchDone, setInitialFetchDone] = useState(false);


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
      setInitialFetchDone(true);
    } catch (err) {
      // Silent fail
      setInitialFetchDone(true);
    }
  }, [classroomId, isTeacher]);

  const initialCleanupDone = useRef(false);

  useEffect(() => {
    if (initialFetchDone && !initialCleanupDone.current) {
      initialCleanupDone.current = true;
      if (isTeacher) {
        const accepted = hands.filter(h => h.status === 'accepted');
        if (accepted.length > 0) {
          console.log('Teacher reloaded, cleaning up dead accepted hands...');
          accepted.forEach(hand => {
            classroomAPI.completeHand(classroomId, hand.student._id).then(() => fetchHands());
          });
        }
      } else if (!isTeacher && myHand?.status === 'accepted') {
        console.log('Page reloaded while hand was accepted. Auto-cancelling...');
        handleCancelHand();
      }
    }
  }, [initialFetchDone, hands, myHand, isTeacher, classroomId]);
  const splitCid = (cid: string) => {
    const separatorIndex = cid.indexOf(':');
    if (separatorIndex === -1) return { type: 'messaging', id: cid };
    return {
      type: cid.slice(0, separatorIndex),
      id: cid.slice(separatorIndex + 1),
    };
  };

  const watchDirectChannelByCid = useCallback(async (cid: string) => {
    const { type, id } = splitCid(cid);
    const channel = client.channel(type, id) as Channel;

    if (!watchedDirectChannelCidsRef.current.has(cid) && !(channel as any).initialized) {
      await channel.watch({ messages: { limit: 1, include_hidden_messages: true } } as any);
      watchedDirectChannelCidsRef.current.add(cid);
    }

    return channel;
  }, [client]);

  const getMemberRole = (channel: Channel, userId?: string) => {
    if (!userId) return undefined;
    return (((channel as any).state?.members?.[userId]?.channel_role)
      || ((channel as any).state?.membership?.user_id === userId
        ? (channel as any).state?.membership?.channel_role
        : undefined)) as string | undefined;
  };

  const isInactiveInviteRole = (role?: string) => role === 'pending' || role === 'skipped';

  const acceptDirectInviteIfNeeded = useCallback(async (cid: string) => {
    if (!client?.userID) return false;

    const inFlight = acceptingInviteByCidRef.current.get(cid);
    if (inFlight) return inFlight;

    const promise = (async () => {
      const channel = await watchDirectChannelByCid(cid);
      const membershipRole = getMemberRole(channel, client.userID)
        || ((channel as any).state?.membership?.channel_role as string | undefined);

      if (!membershipRole || isInactiveInviteRole(membershipRole)) {
        try {
          await channel.acceptInvite('accept');
        } catch (err: any) {
          const message = String(err?.response?.data?.message || err?.message || '').toLowerCase();
          if (!message.includes('already') && !message.includes('accepted')) {
            throw err;
          }
        }
      }

      return true;
    })().finally(() => {
      acceptingInviteByCidRef.current.delete(cid);
    });

    acceptingInviteByCidRef.current.set(cid, promise);
    return promise;
  }, [client, watchDirectChannelByCid]);

  const startTeacherCallWhenReady = useCallback(async (studentId: string, studentErmisId: string, dmChannelCid: string) => {
    if (!callNode) {
      throw new Error('Call node is not ready');
    }
    if (teacherStartedCallCidsRef.current.has(dmChannelCid)) return;

    teacherStartedCallCidsRef.current.add(dmChannelCid);
    activeCallRef.current = { studentId, studentErmisId };

    try {
      await createCall('audio', dmChannelCid);
    } catch (err) {
      teacherStartedCallCidsRef.current.delete(dmChannelCid);
      activeCallRef.current = null;
      throw err;
    }
  }, [callNode, createCall]);

  const emitStudentReadyForCall = useCallback(async (dmChannelCid: string, studentErmisId: string, teacherErmisId?: string) => {
    if (!dmChannelCid || studentReadyCidsRef.current.has(dmChannelCid)) return;

    const accepted = await acceptDirectInviteIfNeeded(dmChannelCid);
    if (!accepted || studentReadyCidsRef.current.has(dmChannelCid)) return;

    studentReadyCidsRef.current.add(dmChannelCid);
    socketRef.current?.emit('student_ready_for_call', {
      classroomId,
      studentErmisId,
      teacherErmisId,
      dmChannelCid,
    });
  }, [acceptDirectInviteIfNeeded, classroomId]);
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
      if (!isTeacher && (user?.ermisUserId === data.studentErmisId || user?.username === data.studentErmisId)) {
        setMyHand(prev => prev ? { ...prev, status: 'accepted', dmChannelCid: data.dmChannelCid || prev.dmChannelCid } : null);
        console.log('Hand accepted by teacher. Auto-accepting direct invite...');

        if (data.dmChannelCid) {
          emitStudentReadyForCall(data.dmChannelCid, data.studentErmisId, data.teacherErmisId)
            .catch((err) => console.error('Auto accept direct invite error:', err));
        }
      }
    });

    socket.on('student_ready_for_call', (data: any) => {
      if (!isTeacher) return;
      const pending = pendingTeacherCallRef.current;
      if (!pending) return;
      if (pending.studentErmisId !== data.studentErmisId || pending.dmChannelCid !== data.dmChannelCid) return;

      pendingTeacherCallRef.current = null;
      startTeacherCallWhenReady(pending.studentId, pending.studentErmisId, pending.dmChannelCid).catch((err) => {
        activeCallRef.current = null;
        console.error('Start call after student ready error:', err);
      });
    });
    socket.on('hand_completed', (data: any) => {
      resetCall?.();
      activeCallRef.current = null;
      pendingTeacherCallRef.current = null;
      teacherStartedCallCidsRef.current.clear();
      studentReadyCidsRef.current.clear();
      if (isTeacher) fetchHands();
      if (!isTeacher && (user?.ermisUserId === data.studentErmisId || user?.username === data.studentErmisId)) {
        activeCallRef.current = null;
        pendingTeacherCallRef.current = null;
        teacherStartedCallCidsRef.current.clear();
        studentReadyCidsRef.current.clear();
        setMyHand(null);
        console.log('Call completed by teacher!');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [classroomId, emitStudentReadyForCall, fetchHands, isTeacher, resetCall, startTeacherCallWhenReady, user?.ermisUserId, user?.username]);

  // Student: Raise hand
  const handleRaiseHand = async () => {
    setIsRaising(true);
    try {
      studentReadyCidsRef.current.clear();
      completedHandKeysRef.current.clear();
      await classroomAPI.raiseHand(classroomId);
      await fetchHands();
      socketRef.current?.emit('raise_hand', { classroomId });
    } catch (err: any) {
      console.error('Raise hand error:', err);
    } finally {
      setIsRaising(false);
    }
  };

  // Student: Cancel hand
  const handleCancelHand = async () => {
    setIsCancelling(true);
    try {
      studentReadyCidsRef.current.clear();
      completedHandKeysRef.current.clear();
      await classroomAPI.cancelHand(classroomId);
      setMyHand(null);
      socketRef.current?.emit('cancel_hand', { classroomId });
    } catch (err: any) {
      console.error('Cancel hand error:', err);
    } finally {
      setIsCancelling(false);
    }
  };
  const getDirectChannelMemberIds = (channel: Channel) => {
    const stateMembers = Object.keys((channel as any).state?.members || {});
    if (stateMembers.length > 0) return stateMembers;
    const dataMembers = ((channel as any).data?.members || []) as any[];
    return dataMembers.map((member) => member.user_id || member.user?.id || member).filter(Boolean);
  };

  const getOrCreateDirectChannel = useCallback(async (studentErmisId: string) => {
    if (!client?.userID) {
      throw new Error('Chat client is not ready for calls');
    }

    const memberIds = [client.userID, studentErmisId];
    const existingChannel = Object.values((client as any).activeChannels || {}).find((channel: any) => {
      if (channel.type !== 'messaging') return false;
      const ids = getDirectChannelMemberIds(channel);
      return ids.length === 2 && memberIds.every((id) => ids.includes(id));
    }) as Channel | undefined;

    if (existingChannel?.cid) {
      if (!(existingChannel as any).initialized) {
        await existingChannel.watch({ messages: { limit: 1, include_hidden_messages: true } } as any).then(() => watchedDirectChannelCidsRef.current.add(existingChannel.cid)).catch(() => undefined);
      }
      return existingChannel;
    }

    let dmChannel = client.channel('messaging', { members: memberIds } as any) as Channel;
    const response = await dmChannel.create() as any;
    if (response?.channel?.id) {
      dmChannel = client.channel('messaging', response.channel.id) as Channel;
    }
    await dmChannel.watch({ messages: { limit: 1, include_hidden_messages: true } } as any);
    watchedDirectChannelCidsRef.current.add(dmChannel.cid);
    return dmChannel;
  }, [client]);
  // Teacher: Accept hand -> create a direct audio call after the student auto-accepts the DM invite
  const handleAcceptHand = async (studentId: string, studentErmisId?: string, studentName?: string) => {
    if (!studentErmisId) {
      console.error('Cannot start call: student does not have an Ermis user id');
      return;
    }

    setIsCancelling(true);
    try {
      rememberCallUserName(studentErmisId, studentName);
      rememberCallUserName(teacher.ermisUserId, teacher.displayName);
      const dmChannel = await getOrCreateDirectChannel(studentErmisId);
      pendingTeacherCallRef.current = { studentId, studentErmisId, dmChannelCid: dmChannel.cid };

      await classroomAPI.acceptHand(classroomId, studentId, dmChannel.cid);
      await fetchHands();

      socketRef.current?.emit('accept_hand', {
        classroomId,
        studentErmisId,
        dmChannelCid: dmChannel.cid,
        teacherErmisId: client.userID,
      });
    } catch (err: any) {
      activeCallRef.current = null;
      pendingTeacherCallRef.current = null;
      console.error('Accept hand / prepare call error:', err);
    } finally {
      setIsCancelling(false);
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

  const completeAcceptedHand = useCallback(async (studentId: string, studentErmisId: string) => {
    const key = `${classroomId}:${studentId}`;
    if (completedHandKeysRef.current.has(key)) return;

    completedHandKeysRef.current.add(key);
    activeCallRef.current = null;
    pendingTeacherCallRef.current = null;
    teacherStartedCallCidsRef.current.clear();
    studentReadyCidsRef.current.clear();

    try {
      socketRef.current?.emit('complete_hand', { classroomId, studentErmisId });
      await classroomAPI.completeHand(classroomId, studentId);
      if (isTeacher) {
        await fetchHands();
      } else {
        setMyHand(null);
      }
    } catch (err) {
      completedHandKeysRef.current.delete(key);
      throw err;
    }
  }, [classroomId, fetchHands, isTeacher]);

  const getMyStudentId = () => {
    const handStudent = (myHand as any)?.student;
    if (typeof handStudent === 'string') return handStudent;
    return handStudent?._id || user?.id;
  };

  const handleStudentEndAcceptedHand = async () => {
    if (!myHand || myHand.status !== 'accepted') return;
    setIsCancelling(true);
    try {
      if (callStatus) {
        await endCall().catch((err: any) => console.error('End student call error:', err));
      }
      const studentId = getMyStudentId();
      if (studentId) {
        await completeAcceptedHand(studentId, user?.ermisUserId || user?.username || studentId);
      } else {
        setMyHand(null);
      }
    } catch (err: any) {
      console.error('Complete student hand error:', err);
    } finally {
      setIsCancelling(false);
    }
  };

  // Teacher: Complete hand
  const handleCompleteHand = async (studentId: string, studentUsername: string) => {
    try {
      if (callStatus) {
        await endCall().catch((err: any) => console.error('End teacher call error:', err));
      }
      await completeAcceptedHand(studentId, studentUsername);
    } catch (err: any) {
      console.error('Complete hand error:', err);
    }
  };


  useEffect(() => {
    const previousStatus = lastCallStatusRef.current;
    const callJustCleared = Boolean(previousStatus) && !callStatus;

    if (callJustCleared && isTeacher && activeCallRef.current) {
      const completedCall = activeCallRef.current;
      completeAcceptedHand(completedCall.studentId, completedCall.studentErmisId)
        .catch((err) => console.error('Auto complete teacher hand error:', err));
    }

    if (callJustCleared && !isTeacher && myHand?.status === 'accepted') {
      const studentId = getMyStudentId();
      if (studentId) {
        completeAcceptedHand(studentId, user?.ermisUserId || user?.username || studentId)
          .catch((err) => console.error('Auto complete student hand error:', err));
      } else {
        setMyHand(null);
      }
    }

    lastCallStatusRef.current = callStatus || '';
  }, [callStatus, completeAcceptedHand, isTeacher, myHand, user?.ermisUserId, user?.username]);
  // Student: When hand is accepted -> wait for the incoming teacher call
  useEffect(() => {
    if (!isTeacher && myHand?.status === 'accepted') {
      console.log('Hand accepted! Waiting for teacher call.');
    }
  }, [isTeacher, myHand]);

  useEffect(() => {
    if (isTeacher || myHand?.status !== 'accepted' || !myHand.dmChannelCid || !user?.ermisUserId) return;

    let cancelled = false;
    emitStudentReadyForCall(myHand.dmChannelCid, user.ermisUserId, teacher.ermisUserId)
      .catch((err) => {
        if (!cancelled) console.error('Auto accept direct invite from hand state error:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [classroomId, emitStudentReadyForCall, isTeacher, myHand?.dmChannelCid, myHand?.status, teacher.ermisUserId, user?.ermisUserId]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Re-render every 5 seconds to update relative time
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  // Helper: time ago
  const timeAgo = (timestamp: string) => {
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

  useEffect(() => {
    if (isTeacher && onPendingCountChange) {
      onPendingCountChange(pendingHands.length);
    }
  }, [isTeacher, pendingHands.length, onPendingCountChange]);

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
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCancelHand(); }}
              disabled={isCancelling}
            >
              {isCancelling ? '...' : <X className="h-4 w-4" />}
            </Button>
          </div>
        ) : myHand.status === 'accepted' ? (
          <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-emerald-500">Giáo viên đã chấp nhận!</span>
                <span className="text-[10px] text-emerald-500/70">Vui lòng bấm "Nghe máy" ở dưới khung chat...</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700 px-2"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStudentEndAcceptedHand(); }}
              disabled={isCancelling}
              title="Kết thúc"
            >
              {isCancelling ? '...' : <X className="h-4 w-4" />}
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
                  onClick={() => handleAcceptHand(hand.student._id, hand.student.ermisUserId, hand.student.displayName)}
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
              <div className="flex items-center gap-1">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 border-emerald-200 text-emerald-600 hover:bg-emerald-50 text-xs px-2"
                  onClick={() => handleCompleteHand(hand.student._id, hand.student.ermisUserId || hand.student.username)}
                >
                  Kết thúc
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
