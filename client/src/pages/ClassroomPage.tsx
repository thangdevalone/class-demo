import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, LogOut, MonitorPlay, X, Play, Square, Loader2, BookOpen, GraduationCap, Users, Copy, Check, Settings, ChevronDown, ChevronUp, Circle, Download, Trash2, Video, Clock, HardDrive, RefreshCw } from 'lucide-react';
import Hls from 'hls.js';
import { useCallback, useEffect, useRef, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { DraggableCore } from 'react-draggable';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { io as socketIO, Socket } from 'socket.io-client';
import CameraPanel from '../components/CameraPanel';
import ClassChat from '../components/ClassChat';
import Whiteboard from '../components/Whiteboard';
import { useAuth } from '../context/AuthContext';
import { classroomAPI } from '../services/api';
import { downloadWithProgress } from '../services/downloadManager';

const API_URL = import.meta.env.VITE_API_URL || '';
const MEDIA_SERVER_URL = import.meta.env.VITE_MEDIA_SERVER_URL || '';

interface Camera {
  cameraId: string;
  name: string;
  url: string;
  description?: string;
}

interface TeacherStream {
  streamId: string;
  masterUrl: string;
  ingestUrl: string;
  serverUrl: string;
  streamKey: string;
}

interface ClassroomData {
  _id: string;
  name: string;
  description: string;
  cameras: Camera[];
  teacher: { _id: string; displayName: string; username: string; ermisUserId?: string };
  students: { _id: string; displayName: string; username: string; ermisUserId?: string }[];
  ermisChannelId: string;
  ermisChannelType: string;
  isActive: boolean;
  classStatus: 'idle' | 'live' | 'ended';
  mediaRoomId: string;
  mediaRoomName: string;
  teacherStream: TeacherStream | null;
  lessonSessionId?: string;
  recordingEnabled?: boolean;
  recordingStatus?: 'none' | 'recording' | 'finalizing' | 'ready' | 'partial' | 'interrupted' | 'failed' | 'deleting';
  recordingHlsUrl?: string;
  recordingMp4Url?: string;
}

interface RecordingItem {
  lesson_session_id: string;
  room_id?: string;
  teacher_stream_id?: string;
  status: string;
  hls_status: string;
  mp4_status: string;
  duration_ms: number;
  stored_bytes: number;
  segment_count?: number;
  discontinuity_count?: number;
  has_gap?: boolean;
  last_error_code?: string | null;
  last_error_message?: string | null;
  hls_url: string | null;
  mp4_url: string | null;
  started_at?: string;
}

export default function ClassroomPage() {
  const { id } = useParams<{ id: string }>();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [classroom, setClassroom] = useState<ClassroomData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [showEndedOverlay, setShowEndedOverlay] = useState(false);
  const [endedCountdown, setEndedCountdown] = useState(5);
  const [showStreamSetup, setShowStreamSetup] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [recordEnabled, setRecordEnabled] = useState(false);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [recordingsCursor, setRecordingsCursor] = useState<string | null>(null);
  const [showRecordings, setShowRecordings] = useState(false);
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const hlsPlayerRef = useRef<HTMLVideoElement | null>(null);
  const hlsInstanceRef = useRef<Hls | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const fetchClassroom = useCallback(async () => {
    if (!id) return;
    try {
      const res = await classroomAPI.get(id);
      setClassroom(res.data.classroom);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Không thể tải thông tin lớp học');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchClassroom();
  }, [fetchClassroom]);

  const userRoleRef = useRef(user?.role);
  useEffect(() => {
    userRoleRef.current = user?.role;
  }, [user?.role]);

  // Socket.IO connection for real-time class events
  useEffect(() => {
    if (!id) return;

    const socket = socketIO(API_URL || window.location.origin);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_classroom', id);
    });

    socket.on('class_started', (data: any) => {
      if (data.classroomId === id) {
        fetchClassroom();
        if (userRoleRef.current !== 'teacher' && userRoleRef.current !== 'admin') {
          toast.success('Lớp học đã bắt đầu!');
        }
      }
    });

    socket.on('class_ended', (data: any) => {
      if (data.classroomId === id) {
        // Show ended overlay for students
        if (userRoleRef.current !== 'teacher') {
          setShowEndedOverlay(true);
        } else {
          fetchClassroom();
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [id, fetchClassroom]);

  // Countdown and auto-redirect when class ends (for students)
  useEffect(() => {
    if (!showEndedOverlay) return;

    setEndedCountdown(5);
    const timer = setInterval(() => {
      setEndedCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showEndedOverlay, navigate]);

  const handleStartClass = async () => {
    if (!id || !classroom) return;
    setIsStarting(true);
    try {
      const res = await classroomAPI.startClass(id, { recordEnabled });
      setClassroom(res.data.classroom);
      // Auto-show stream setup panel if teacher stream exists
      if (res.data.classroom?.teacherStream) {
        setShowStreamSetup(true);
      }
      toast.success(`Đã mở lớp thành công!${recordEnabled ? ' (Đang ghi hình)' : ''}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Không thể mở lớp');
    } finally {
      setIsStarting(false);
    }
  };

  // Fetch recordings list
  const fetchRecordings = useCallback(async (cursor?: string) => {
    if (!id) return;
    setRecordingsLoading(true);
    try {
      const params: any = { limit: 10 };
      if (cursor) params.cursor = cursor;
      const res = await classroomAPI.getRecordings(id, params);
      if (cursor) {
        setRecordings(prev => [...prev, ...(res.data.items || [])]);
      } else {
        setRecordings(res.data.items || []);
      }
      setRecordingsCursor(res.data.next_cursor || null);
    } catch (err) {
      console.error('Failed to fetch recordings:', err);
    } finally {
      setRecordingsLoading(false);
    }
  }, [id]);



  // Load recordings when toggling recordings panel
  useEffect(() => {
    if (showRecordings && recordings.length === 0) {
      fetchRecordings();
    }
  }, [showRecordings, fetchRecordings]);

  const handleDeleteRecording = async (sessionId: string) => {
    if (!id) return;
    if (!window.confirm('Bạn có chắc muốn xóa bản ghi này? Hành động không thể hoàn tác.')) return;
    try {
      await classroomAPI.deleteRecording(id, sessionId);
      setRecordings(prev => prev.filter(r => r.lesson_session_id !== sessionId));
      toast.success('Đã xóa bản ghi');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Không thể xóa bản ghi');
    }
  };

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };


  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // HLS playback — play directly from Media Server like demo.html
  const handlePlayRecording = (rec: RecordingItem) => {
    if (!rec.hls_url) {
      toast.error('HLS chưa sẵn sàng');
      return;
    }
    setPlayingSessionId(rec.lesson_session_id);
  };

  const closePlayer = () => {
    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }
    setPlayingSessionId(null);
  };

  useEffect(() => {
    if (!playingSessionId) return;

    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 30; // ~500ms max wait

    function tryPlay() {
      if (cancelled) return;
      const video = hlsPlayerRef.current;
      if (!video) {
        retryCount++;
        if (retryCount < maxRetries) {
          requestAnimationFrame(tryPlay);
        }
        return;
      }

      const rec = recordings.find(r => r.lesson_session_id === playingSessionId);
      if (!rec?.hls_url) {
        toast.error('Không thể phát bản ghi');
        return;
      }

      // Play directly from Media Server (no auth needed, better performance)
      const hlsUrl = `${MEDIA_SERVER_URL}${rec.hls_url}`;
      console.log('[Recording] Playing HLS:', hlsUrl);

      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
      }

      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
        hls.on(Hls.Events.ERROR, (_: any, data: any) => {
          if (data.fatal) {
            console.error('HLS fatal error:', data);
            toast.error('Không thể phát bản ghi');
          }
        });
        hlsInstanceRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
        video.play();
      }
    }

    requestAnimationFrame(tryPlay);

    return () => {
      cancelled = true;
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
    };
  }, [playingSessionId]);

  const handleDownloadMp4 = (sessionId: string) => {
    const rec = recordings.find(r => r.lesson_session_id === sessionId);
    if (!rec?.mp4_url) {
      toast.error('MP4 chưa sẵn sàng');
      return;
    }
    downloadWithProgress(`${MEDIA_SERVER_URL}${rec.mp4_url}`, `recording-${sessionId}.mp4`);
  };

  const handleEndClass = async () => {
    if (!id || !classroom) return;
    if (!window.confirm('Bạn có chắc muốn kết thúc lớp học? Tất cả học sinh sẽ bị đẩy ra.')) return;
    setIsEnding(true);
    try {
      await classroomAPI.endClass(id);
      await fetchClassroom();
      toast.info('Đã kết thúc lớp học');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Không thể kết thúc lớp');
    } finally {
      setIsEnding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-black"></div>
          <p className="font-medium">Đang tải lớp học...</p>
        </div>
      </div>
    );
  }

  if (error || !classroom) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 p-8 text-center max-w-sm rounded-xl border bg-white shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">⚠️</div>
          <h2 className="text-lg font-bold text-slate-900">Đã xảy ra lỗi</h2>
          <p className="text-sm text-slate-500">{error || 'Không tìm thấy lớp học'}</p>
          <Button onClick={() => navigate('/')} className="mt-4 w-full">Quay lại trang chủ</Button>
        </div>
      </div>
    );
  }

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';
  const isStudent = user?.role === 'student';
  const classIsLive = classroom.classStatus === 'live';
  const classIsIdle = classroom.classStatus === 'idle';
  const classIsEnded = classroom.classStatus === 'ended';

  // Student waiting room — show when class is not live
  if (isStudent && !classIsLive) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100">
        {/* Class Ended Overlay */}
        {showEndedOverlay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-6 rounded-2xl bg-white p-10 shadow-2xl max-w-md text-center animate-in fade-in zoom-in-95 duration-300">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
                <Square className="h-8 w-8 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Lớp học đã kết thúc</h2>
              <p className="text-slate-500">Giáo viên đã kết thúc buổi học. Bạn sẽ được chuyển về trang chủ.</p>
              <div className="flex items-center gap-2 text-lg font-semibold text-slate-700">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-900 font-bold text-xl">
                  {endedCountdown}
                </div>
                <span className="text-sm text-slate-500">giây</span>
              </div>
              <Button onClick={() => navigate('/')} variant="outline" className="w-full">
                Về trang chủ ngay
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-8 max-w-lg text-center p-8">
          {/* Animated waiting indicator */}
          <div className="relative">
            <div className="absolute inset-0 h-24 w-24 animate-ping rounded-full bg-blue-400/20"></div>
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-lg border border-slate-200">
              {classIsEnded ? (
                <Square className="h-10 w-10 text-slate-400" />
              ) : (
                <div className="flex flex-col items-center">
                  <div className="h-3 w-3 rounded-full bg-amber-400 animate-pulse mb-1"></div>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Class info */}
          <div className="space-y-3">
            <h1 className="text-2xl font-bold text-slate-900">{classroom.name}</h1>
            <p className="text-sm text-slate-500">{classroom.description}</p>
          </div>

          {/* Status message */}
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-6 w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${classIsEnded ? 'bg-slate-400' : 'bg-amber-400 animate-pulse'}`}></div>
              <span className="text-sm font-medium text-slate-700">
                {classIsEnded
                  ? 'Lớp học đã kết thúc'
                  : 'Giáo viên chưa mở lớp, vui lòng đợi...'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" /> {classroom.teacher.displayName}</span>
              <span>•</span>
              <span className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" /> {classroom.students.length} học sinh</span>
            </div>
            {classIsEnded && (
              <p className="text-xs text-slate-400">
                Lớp học đã kết thúc. Bạn sẽ có thể vào lại khi giáo viên mở lớp lần tiếp theo.
              </p>
            )}
          </div>

          {/* Animated dots */}
          {!classIsEnded && (
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          )}

          <Button variant="ghost" onClick={() => navigate('/')} className="text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Quay lại trang chủ
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-slate-50 overflow-hidden text-slate-900">
      {/* Class Ended Overlay (for students inside live class) */}
      {showEndedOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6 rounded-2xl bg-white p-10 shadow-2xl max-w-md text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
              <Square className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Lớp học đã kết thúc</h2>
            <p className="text-slate-500">Giáo viên đã kết thúc buổi học. Bạn sẽ được chuyển về trang chủ.</p>
            <div className="flex items-center gap-2 text-lg font-semibold text-slate-700">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-900 font-bold text-xl">
                {endedCountdown}
              </div>
              <span className="text-sm text-slate-500">giây</span>
            </div>
            <Button onClick={() => navigate('/')} variant="outline" className="w-full">
              Về trang chủ ngay
            </Button>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Quay lại">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold tracking-tight text-slate-900">{classroom.name}</h1>
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              {classIsLive ? (
                <span className="flex items-center gap-1.5 text-red-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> Đang phát trực tiếp
                </span>
              ) : classIsEnded ? (
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Đã kết thúc
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-amber-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Chưa mở
                </span>
              )}
              {/* REC indicator */}
              {classIsLive && classroom.recordingEnabled && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-red-600 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
                    REC
                  </span>
                </>
              )}
              <span>•</span>
              <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {classroom.teacher.displayName}</span>
              <span>•</span>
              <span className="flex items-center gap-1"><GraduationCap className="h-3 w-3" /> {classroom.students.length} học sinh</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Teacher class controls */}
          {isTeacher && (
            <>
              {(classIsIdle || classIsEnded) && (
                <div className="flex items-center gap-3">
                  {/* Recording Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${recordEnabled ? 'bg-red-500' : 'bg-slate-300'
                        }`}
                      onClick={() => setRecordEnabled(!recordEnabled)}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${recordEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                          }`}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                      <Circle className={`h-2.5 w-2.5 ${recordEnabled ? 'fill-red-500 text-red-500' : 'text-slate-400'}`} />
                      Ghi hình
                    </span>
                  </label>
                  <Button
                    size="sm"
                    className="gap-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleStartClass}
                    disabled={isStarting}
                  >
                    {isStarting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Đang mở...</>
                    ) : (
                      <><Play className="h-4 w-4" /> Mở lớp</>
                    )}
                  </Button>
                </div>
              )}
              {classIsLive && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-2 text-xs font-medium"
                  onClick={handleEndClass}
                  disabled={isEnding}
                >
                  {isEnding ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Đang kết thúc...</>
                  ) : (
                    <><Square className="h-4 w-4" /> Kết thúc lớp</>
                  )}
                </Button>
              )}
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            className={`gap-2 text-xs font-medium transition-colors ${whiteboardOpen ? 'bg-amber-500 text-amber-950 hover:bg-amber-400' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            onClick={() => setWhiteboardOpen(!whiteboardOpen)}
          >
            <MonitorPlay className="h-4 w-4" /> Bảng trắng
          </Button>

          <Badge variant="outline" className={`border-0 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 ${isTeacher ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
            {isTeacher ? 'Giáo viên' : 'Học sinh'}
          </Badge>

          {/* Stream Setup Toggle */}
          {isTeacher && classIsLive && classroom.teacherStream && (
            <Button
              variant="ghost"
              size="sm"
              className={`gap-2 text-xs font-medium transition-colors ${showStreamSetup
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              onClick={() => setShowStreamSetup(!showStreamSetup)}
            >
              <Settings className="h-4 w-4" />
              OBS Setup
              {showStreamSetup ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}

          {/* Recordings Toggle */}
          {(
            <Button
              variant="ghost"
              size="sm"
              className={`gap-2 text-xs font-medium transition-colors ${showRecordings
                  ? 'bg-violet-500 text-white hover:bg-violet-600'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              onClick={() => setShowRecordings(!showRecordings)}
            >
              <Video className="h-4 w-4" />
              Bản ghi
            </Button>
          )}

          <Button variant="ghost" size="icon" onClick={logout} className="text-slate-500 hover:bg-slate-100 hover:text-red-500" title="Đăng xuất">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Teacher Stream Setup Panel */}
      {isTeacher && showStreamSetup && classroom.teacherStream && (
        <div className="shrink-0 border-b border-blue-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500 text-white">
                  <Settings className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Cấu hình OBS / Phần mềm stream</h3>
                  <p className="text-[11px] text-slate-500">Sao chép thông tin bên dưới vào OBS để bắt đầu stream</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-slate-600"
                onClick={() => setShowStreamSetup(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* Server URL */}
              <div className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2">
                <div className="shrink-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Server</span>
                </div>
                <code className="flex-1 text-xs font-mono text-slate-700 truncate" title={classroom.teacherStream.serverUrl}>
                  {classroom.teacherStream.serverUrl}
                </code>
                <button
                  onClick={() => copyToClipboard(classroom.teacherStream!.serverUrl, 'server')}
                  className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all hover:bg-slate-100"
                  style={{ color: copiedField === 'server' ? '#16a34a' : '#64748b' }}
                >
                  {copiedField === 'server' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedField === 'server' ? 'Đã chép!' : 'Copy'}
                </button>
              </div>

              {/* Stream Key */}
              <div className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2">
                <div className="shrink-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Stream Key</span>
                </div>
                <code className="flex-1 text-xs font-mono text-slate-700 truncate" title={classroom.teacherStream.streamKey}>
                  {classroom.teacherStream.streamKey}
                </code>
                <button
                  onClick={() => copyToClipboard(classroom.teacherStream!.streamKey, 'key')}
                  className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all hover:bg-slate-100"
                  style={{ color: copiedField === 'key' ? '#16a34a' : '#64748b' }}
                >
                  {copiedField === 'key' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedField === 'key' ? 'Đã chép!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Full RTMP URL for convenience */}
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2">
              <div className="shrink-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Full URL</span>
              </div>
              <code className="flex-1 text-xs font-mono text-slate-300 truncate" title={classroom.teacherStream.ingestUrl}>
                {classroom.teacherStream.ingestUrl}
              </code>
              <button
                onClick={() => copyToClipboard(classroom.teacherStream!.ingestUrl, 'full')}
                className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all hover:bg-slate-800"
                style={{ color: copiedField === 'full' ? '#4ade80' : '#94a3b8' }}
              >
                {copiedField === 'full' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedField === 'full' ? 'Đã chép!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Recordings Panel */}
      {showRecordings && (
        <div className="shrink-0 border-b border-violet-200 bg-gradient-to-r from-violet-50 via-purple-50 to-violet-50">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500 text-white">
                  <Video className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Lịch sử bản ghi</h3>
                  <p className="text-[11px] text-slate-500">Các bản ghi của lớp học này</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-400 hover:text-slate-600"
                  onClick={() => fetchRecordings()}
                  disabled={recordingsLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${recordingsLoading ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowRecordings(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>


            {recordingsLoading && recordings.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
              </div>
            ) : recordings.length === 0 ? (
              <div className="text-center py-6 text-sm text-slate-400">Chưa có bản ghi nào</div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {recordings.map((rec) => {
                  const isReady = rec.status === 'ready';
                  const isFinalizing = rec.status === 'finalizing';
                  const isFailed = rec.status === 'failed';
                  const isRecording = rec.status === 'recording';

                  return (
                    <Fragment key={rec.lesson_session_id}>
                      <div
                        className="flex items-center gap-3 rounded-lg bg-white border border-slate-200 px-3 py-2"
                      >
                        {/* Status icon */}
                        <div className="shrink-0">
                          {isReady && <Check className="h-4 w-4 text-emerald-500" />}
                          {isFinalizing && <Loader2 className="h-4 w-4 animate-spin text-amber-500" />}
                          {isFailed && <X className="h-4 w-4 text-red-500" />}
                          {isRecording && <Circle className="h-4 w-4 fill-red-500 text-red-500 animate-pulse" />}
                          {!isReady && !isFinalizing && !isFailed && !isRecording && (
                            <Circle className="h-4 w-4 text-slate-300" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-slate-700">
                              {rec.started_at ? formatDate(rec.started_at) : rec.lesson_session_id.slice(0, 20)}
                            </span>
                            <Badge
                              variant="secondary"
                              className={`text-[9px] px-1.5 py-0 ${isReady ? 'bg-emerald-100 text-emerald-700' :
                                  isFinalizing ? 'bg-amber-100 text-amber-700' :
                                    isFailed ? 'bg-red-100 text-red-700' :
                                      isRecording ? 'bg-red-100 text-red-700' :
                                        'bg-slate-100 text-slate-500'
                                }`}
                            >
                              {rec.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                            {rec.duration_ms > 0 && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDuration(rec.duration_ms)}
                              </span>
                            )}
                            {rec.stored_bytes > 0 && (
                              <span className="flex items-center gap-1">
                                <HardDrive className="h-3 w-3" />
                                {formatBytes(rec.stored_bytes)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {isReady && (
                            <>
                              <button
                                onClick={() => handlePlayRecording(rec)}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-violet-600 hover:bg-violet-100 transition-colors"
                              >
                                <Play className="h-3.5 w-3.5" />
                                Xem lại
                              </button>
                              <button
                                onClick={() => handleDownloadMp4(rec.lesson_session_id)}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                              >
                                <Download className="h-3.5 w-3.5" />
                                MP4
                              </button>
                              {isTeacher && (
                                <button
                                  onClick={() => handleDeleteRecording(rec.lesson_session_id)}
                                  className="inline-flex items-center rounded-md p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Xóa bản ghi"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </Fragment>
                  );
                })}

                {/* Load more */}
                {recordingsCursor && (
                  <button
                    className="w-full text-center py-2 text-xs font-medium text-violet-600 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors"
                    onClick={() => fetchRecordings(recordingsCursor)}
                    disabled={recordingsLoading}
                  >
                    {recordingsLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Tải thêm...'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left/Center Workspace */}
        <main className="flex flex-1 flex-col bg-slate-100 p-2 relative">
          <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {classIsLive && (classroom.cameras.length > 0 || classroom.teacherStream) ? (
              <CameraPanel cameras={classroom.cameras} teacherStream={classroom.teacherStream} />
            ) : (
              <div className="flex h-full items-center justify-center bg-slate-900 text-slate-400">
                <div className="flex flex-col items-center gap-4 text-center">
                  {classIsLive ? (
                    <>
                      <div className="h-12 w-12 rounded-full bg-slate-800 flex items-center justify-center">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                      </div>
                      <p className="text-sm font-medium">Không có camera nào được cấu hình</p>
                    </>
                  ) : (
                    <>
                      <div className="h-16 w-16 rounded-full bg-slate-800 flex items-center justify-center">
                        {classIsEnded ? (
                          <Square className="h-8 w-8 text-slate-500" />
                        ) : (
                          <Play className="h-8 w-8 text-slate-500" />
                        )}
                      </div>
                      <p className="text-lg font-semibold text-slate-300">
                        {classIsEnded ? 'Lớp học đã kết thúc' : 'Lớp chưa được mở'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {isTeacher
                          ? (classIsEnded ? 'Bấm "Mở lớp" để bắt đầu buổi học mới' : 'Bấm "Mở lớp" để bắt đầu phát stream')
                          : 'Vui lòng đợi giáo viên mở lớp'}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Draggable Whiteboard — rendered via portal to body so it's above all dialogs */}
          {whiteboardOpen && createPortal(
            // @ts-expect-error react-draggable types are not fully compatible with React 18
            <DraggableCore
              handle=".whiteboard-drag-handle"
              onDrag={(e, data) => {
                const node = document.getElementById('whiteboard-container');
                if (node) {
                  const currentTop = parseInt(node.style.top || '80', 10);
                  const currentLeft = parseInt(node.style.left || '80', 10);
                  node.style.top = `${currentTop + data.deltaY}px`;
                  node.style.left = `${currentLeft + data.deltaX}px`;
                }
              }}
            >
              <div
                id="whiteboard-container"
                className="fixed z-[9999] flex flex-col rounded-xl overflow-hidden shadow-2xl border border-slate-200 bg-white resize"
                style={{ top: '80px', left: '80px', width: 600, height: 450, minWidth: 200, minHeight: 200, maxWidth: '90vw', maxHeight: '85vh' }}
              >
                <div className="whiteboard-drag-handle flex items-center justify-between bg-slate-100 border-b border-slate-200 p-2 cursor-move text-slate-700 select-none">
                  <div className="flex items-center gap-2">
                    <MonitorPlay className="h-4 w-4" />
                    <span className="text-xs font-semibold">Ghi chú (kéo thả góc phải dưới để đổi cỡ)</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-slate-900 hover:bg-slate-200" onClick={() => setWhiteboardOpen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>
                  <Whiteboard classroomId={classroom._id} />
                </div>
              </div>
            </DraggableCore>,
            document.body
          )}
        </main>

        {/* Right Sidebar (Chat) */}
        <aside className="flex w-[420px] flex-col border-l border-slate-200 bg-white">
          <div className="flex h-full flex-col overflow-hidden min-w-[420px]">
            {/* Containers */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <ClassChat
                classroomId={classroom._id}
                ermisChannelId={classroom.ermisChannelId}
                ermisChannelType={classroom.ermisChannelType}
                hideChat={false}
                isTeacher={isTeacher}
                teacher={classroom.teacher}
                students={classroom.students}
              />
            </div>
          </div>
        </aside>
      </div>

      {/* Recording Playback Dialog */}
      <Dialog open={!!playingSessionId} onOpenChange={(open) => { if (!open) closePlayer(); }}>
        <DialogContent className="sm:max-w-[800px] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Play className="h-4 w-4 text-violet-600" />
              Xem lại bản ghi
            </DialogTitle>
          </DialogHeader>
          <div className="bg-black">
            <video
              ref={hlsPlayerRef}
              controls
              autoPlay
              className="w-full"
              style={{ maxHeight: '70vh', aspectRatio: '16/9' }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
