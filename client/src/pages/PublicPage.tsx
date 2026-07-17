import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { classroomAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Users, Video, Search, GraduationCap, LogOut, ArrowRight, XCircle, CheckCircle, Radio } from 'lucide-react';

type ClassroomItem = any; // simplified type

export default function PublicPage() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  // Data states
  const [classrooms, setClassrooms] = useState<ClassroomItem[]>([]);
  const [myClassrooms, setMyClassrooms] = useState<ClassroomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const isTeacher = user?.role === 'teacher';
  const isStudent = user?.role === 'student';

  const fetchData = async () => {
    setLoading(true);
    try {
      if (!isAuthenticated) {
        const res = await classroomAPI.publicBrowse();
        setClassrooms(res.data.classrooms);
      } else {
        const [myRes, browseRes] = await Promise.all([
          classroomAPI.list(),
          classroomAPI.browse()
        ]);
        setMyClassrooms(myRes.data.classrooms);
        setClassrooms(browseRes.data.classrooms);
      }
    } catch (error) {
      console.error("Failed to load classes", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAuthenticated]);

  const filteredClassrooms = useMemo(() => {
    if (!search.trim()) return classrooms;
    const s = search.toLowerCase();
    return classrooms.filter(
      (c) => c.name.toLowerCase().includes(s) || c.teacher?.displayName?.toLowerCase().includes(s)
    );
  }, [classrooms, search]);

  const handleRegister = async (classroomId: string) => {
    try {
      await classroomAPI.register(classroomId);
      fetchData();
    } catch (err: any) { alert(err.response?.data?.error || 'Đăng ký thất bại'); }
  };

  const handleUnregister = async (classroomId: string) => {
    if (!window.confirm('Bạn có chắc muốn hủy đăng ký lớp học này?')) return;
    try {
      await classroomAPI.unregister(classroomId);
      fetchData();
    } catch (err: any) { alert(err.response?.data?.error || 'Hủy đăng ký thất bại'); }
  };

  const getClassStatus = (c: ClassroomItem) => {
    const status = c.classStatus || 'idle';
    switch (status) {
      case 'live':
        return { label: 'Đang diễn ra', color: 'text-emerald-600', dotColor: 'bg-emerald-500', animate: true };
      case 'ended':
        return { label: 'Đã kết thúc', color: 'text-slate-500', dotColor: 'bg-slate-400', animate: false };
      case 'idle':
      default:
        return { label: 'Chưa mở', color: 'text-amber-600', dotColor: 'bg-amber-400', animate: false };
    }
  };

  const ClassroomCard = ({ c, showEnter = true, showRegister = false }: { c: any; showEnter?: boolean; showRegister?: boolean }) => {
    const classStatus = getClassStatus(c);
    return (
      <Card className="flex flex-col hover:shadow-md transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-base">{c.name}</CardTitle>
            <Badge
              variant={c.classStatus === 'live' ? 'default' : 'secondary'}
              className={`text-[10px] font-normal gap-1 ${c.classStatus === 'live' ? 'bg-emerald-600' : ''}`}
            >
              {c.classStatus === 'live' && <Radio className="h-2.5 w-2.5" />}
              {classStatus.label}
            </Badge>
          </div>
          <CardDescription className="line-clamp-2 mt-1">{c.description || 'Không có mô tả'}</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 space-y-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span className="font-medium text-foreground">{c.teacher?.displayName || '—'}</span>
          </div>
          <div className="flex items-center gap-5 text-muted-foreground pt-1">
            <div className="flex items-center gap-1.5"><Users className="h-4 w-4" /> {c.students?.length ?? c.studentCount ?? 0} học sinh</div>
            <div className="flex items-center gap-1.5"><Video className="h-4 w-4" /> {c.cameras?.length ?? c.cameraCount ?? 0} cam</div>
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-medium pt-2 ${classStatus.color}`}>
            <span className={`h-2 w-2 rounded-full ${classStatus.dotColor} ${classStatus.animate ? 'animate-pulse' : ''}`}></span>
            {classStatus.label}
          </div>
        </CardContent>
        <CardFooter>
          {!isAuthenticated && (
            <Button className="w-full" onClick={() => navigate('/login')}>
              Đăng nhập để đăng ký
            </Button>
          )}
          {isAuthenticated && showEnter && (
            <Button className="w-full" onClick={() => navigate(`/classroom/${c._id}`)}>
              <ArrowRight className="h-4 w-4" /> Vào lớp
            </Button>
          )}
          {isAuthenticated && showRegister && (
            c.isRegistered ? (
              <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => handleUnregister(c._id)}>
                <XCircle className="h-4 w-4" /> Hủy đăng ký
              </Button>
            ) : (
              <Button className="w-full" onClick={() => handleRegister(c._id)}>
                <CheckCircle className="h-4 w-4" /> Đăng ký tham gia
              </Button>
            )
          )}
        </CardFooter>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black text-white rounded-lg flex items-center justify-center">
              <BookOpen className="h-4 w-4" />
            </div>
            <span className="font-semibold text-lg tracking-tight">Acme Education</span>
          </div>
          <div className="flex items-center gap-4">
            {!isAuthenticated ? (
              <>
                <Button variant="ghost" onClick={() => navigate('/login?tab=login')}>Đăng nhập</Button>
                <Button onClick={() => navigate('/login?tab=signup')}>Đăng ký</Button>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50">
                  <Badge variant="outline" className={`h-5 px-1.5 text-[10px] uppercase tracking-wider font-semibold border-0 ${isTeacher ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {isTeacher ? 'Giáo viên' : 'Học sinh'}
                  </Badge>
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                    {user?.displayName?.charAt(0)}
                  </div>
                  <span className="text-sm font-medium">{user?.displayName}</span>
                </div>
                <Button variant="ghost" size="icon" onClick={logout} title="Đăng xuất">
                  <LogOut className="h-5 w-5 text-slate-500" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12">
        {!isAuthenticated && (
          <div className="mb-10 text-center space-y-4">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">Khám phá các lớp học</h1>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">Đăng ký tham gia các khóa học chất lượng từ các giảng viên hàng đầu. Học trực tuyến mọi lúc mọi nơi.</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-black rounded-full animate-spin" /></div>
        ) : (
          isAuthenticated ? (
            <Tabs defaultValue="my-classes" className="space-y-6">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900">Lớp học</h2>
                  <p className="text-sm text-slate-500 mt-1">Đăng ký và tham gia lớp học của bạn</p>
                </div>
                <TabsList className="bg-slate-100 p-1 rounded-lg">
                  <TabsTrigger value="my-classes" className="rounded-md">Lớp của tôi ({myClassrooms.length})</TabsTrigger>
                  <TabsTrigger value="browse" className="rounded-md">Tìm lớp học</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="my-classes" className="mt-0">
                {myClassrooms.length === 0 ? (
                  <Card className="border-dashed border-2 border-slate-200 shadow-none bg-slate-50/50">
                    <CardContent className="flex flex-col items-center justify-center py-24 text-slate-500">
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-4">
                        <GraduationCap size={24} className="text-slate-400" />
                      </div>
                      <p className="font-medium text-slate-900 text-lg">Bạn chưa tham gia lớp nào</p>
                      <p className="text-sm mt-1">Chuyển sang tab "Tìm lớp học" để đăng ký</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {myClassrooms.map(c => <ClassroomCard key={c._id} c={c} showEnter={true} showRegister={false} />)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="browse" className="mt-0 space-y-6">
                <Card>
                  <CardContent className="p-4 flex gap-4 items-center">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9" placeholder="Tìm kiếm theo tên lớp, giáo viên..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                  </CardContent>
                </Card>

                {filteredClassrooms.length === 0 ? (
                  <div className="text-center py-20 text-slate-500">Không tìm thấy lớp học nào phù hợp.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredClassrooms.map(c => <ClassroomCard key={c._id} c={c} showEnter={false} showRegister={true} />)}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {classrooms.map((c) => <ClassroomCard key={c._id} c={c} />)}
              {classrooms.length === 0 && (
                <div className="col-span-full text-center py-20 text-slate-500">Hiện tại chưa có lớp học nào mở đăng ký.</div>
              )}
            </div>
          )
        )}
      </main>
    </div>
  );
}
