import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LogOut, MonitorPlay, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import Draggable from 'react-draggable';
import { useNavigate, useParams } from 'react-router-dom';
import CameraPanel from '../components/CameraPanel';
import ClassChat from '../components/ClassChat';
import Whiteboard from '../components/Whiteboard';
import { useAuth } from '../context/AuthContext';
import { classroomAPI } from '../services/api';

interface Camera {
  name: string;
  url: string;
  description?: string;
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
}

export default function ClassroomPage() {
  const { id } = useParams<{ id: string }>();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [classroom, setClassroom] = useState<ClassroomData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [whiteboardOpen, setWhiteboardOpen] = useState(false);

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

  const isTeacher = user?.role === 'teacher';

  return (
    <div className="flex h-screen w-full flex-col bg-slate-50 overflow-hidden text-slate-900">
      {/* Top Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Quay lại">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold tracking-tight text-slate-900">{classroom.name}</h1>
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="flex items-center gap-1.5 text-red-500">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> Đang phát trực tiếp
              </span>
              <span>•</span>
              <span>👨‍🏫 {classroom.teacher.displayName}</span>
              <span>•</span>
              <span>🎓 {classroom.students.length} học sinh</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
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

          <Button variant="ghost" size="icon" onClick={logout} className="text-slate-500 hover:bg-slate-100 hover:text-red-500" title="Đăng xuất">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left/Center Workspace */}
        <main className="flex flex-1 flex-col bg-slate-100 p-2 relative">
          <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <CameraPanel cameras={classroom.cameras} />
          </div>

          {/* Draggable Whiteboard */}
          {whiteboardOpen && (
            // @ts-expect-error react-draggable types are not fully compatible with React 18
            <Draggable handle=".whiteboard-drag-handle" bounds="parent">
              <div
                className="absolute top-4 left-4 z-50 flex flex-col rounded-xl overflow-hidden shadow-2xl border border-slate-200 bg-white resize"
                style={{ width: 600, height: 450, minWidth: 200, minHeight: 200, maxWidth: '90%', maxHeight: '90%' }}
              >
                <div className="whiteboard-drag-handle flex items-center justify-between bg-slate-100 border-b border-slate-200 p-2 cursor-move text-slate-700">
                  <div className="flex items-center gap-2">
                    <MonitorPlay className="h-4 w-4" />
                    <span className="text-xs font-semibold">Ghi chú (kéo thả góc phải dưới để đổi cỡ)</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-slate-900 hover:bg-slate-200" onClick={() => setWhiteboardOpen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 relative">
                  <Whiteboard classroomId={classroom._id} />
                </div>
              </div>
            </Draggable>
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
    </div>
  );
}
