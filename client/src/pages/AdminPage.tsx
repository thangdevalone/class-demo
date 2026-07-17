import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ChevronRight,
  LayoutGrid,
  LogOut,
  Pencil,
  Plus,
  School,
  Trash2,
  Users,
  Video, BookOpen, GraduationCap, Eye, EyeOff, Loader2, Radio, Camera
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI, classroomAPI } from '../services/api';

type Section = 'users' | 'classrooms';

console.log('[AdminPage] Loaded at:', new Date().toISOString(), 'Has getMediaRooms:', !!classroomAPI.getMediaRooms);

interface MediaRoom {
  room_id: string;
  name: string;
  description: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface MediaCamera {
  camera_id: string;
  name: string;
  description?: string;
}

export default function AdminPage() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<Section>('users');
  const [isLoading, setIsLoading] = useState(true);

  // User form
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState('student');
  const [userFormError, setUserFormError] = useState('');
  const [userFormLoading, setUserFormLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Classroom form
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClassroom, setEditingClassroom] = useState<any>(null);
  const [className, setClassName] = useState('');
  const [classDesc, setClassDesc] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');

  const [classFormError, setClassFormError] = useState('');
  const [classFormLoading, setClassFormLoading] = useState(false);

  // Media rooms
  const [mediaRooms, setMediaRooms] = useState<MediaRoom[]>([]);
  const [selectedMediaRoom, setSelectedMediaRoom] = useState('');
  const [selectedMediaRoomName, setSelectedMediaRoomName] = useState('');
  const [mediaRoomsLoading, setMediaRoomsLoading] = useState(false);
  const [roomCameras, setRoomCameras] = useState<MediaCamera[]>([]);
  const [camerasLoading, setCamerasLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [usersRes, classroomsRes] = await Promise.all([authAPI.getUsers(), classroomAPI.list()]);
      setUsers(usersRes.data.users);
      setClassrooms(classroomsRes.data.classrooms);
    } catch (err) { console.error('Failed to fetch:', err); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  // Fetch media rooms when classroom dialog opens
  const fetchMediaRooms = async () => {
    setMediaRoomsLoading(true);
    try {
      console.log('[AdminPage] Fetching media rooms...');
      const res = await classroomAPI.getMediaRooms();
      console.log('[AdminPage] Media rooms response:', res.data);
      setMediaRooms(res.data.rooms || []);
    } catch (err: any) {
      console.error('[AdminPage] Failed to fetch media rooms:', err?.response?.status, err?.response?.data, err?.message);
      toast.error('Không thể tải danh sách phòng media');
    } finally {
      setMediaRoomsLoading(false);
    }
  };

  // Fetch cameras when a room is selected
  const fetchRoomCameras = async (roomId: string) => {
    if (!roomId) { setRoomCameras([]); return; }
    setCamerasLoading(true);
    try {
      const res = await classroomAPI.getMediaRoomCameras(roomId);
      setRoomCameras(res.data.cameras || []);
    } catch (err) {
      console.error('Failed to fetch cameras:', err);
      setRoomCameras([]);
    } finally {
      setCamerasLoading(false);
    }
  };

  const resetUserForm = () => {
    setEditingUserId(null);
    setNewUsername('');
    setNewPassword('');
    setNewDisplayName('');
    setNewRole('student');
    setUserFormError('');
    setShowPassword(false);
  };

  const openEditUser = (user: any) => {
    setEditingUserId(user._id);
    setNewUsername(user.username);
    setNewPassword(''); // keep empty to not change
    setNewDisplayName(user.displayName);
    setNewRole(user.role);
    setUserFormError('');
    setShowPassword(false);
    setUserDialogOpen(true);
  };

  const handleSaveUser = async () => {
    if (!newUsername || (!editingUserId && !newPassword) || !newDisplayName) { setUserFormError('Điền đầy đủ thông tin'); return; }
    setUserFormLoading(true); setUserFormError('');
    try {
      if (editingUserId) {
        const payload: any = { displayName: newDisplayName, role: newRole };
        if (newPassword) payload.password = newPassword;
        await authAPI.updateUser(editingUserId, payload);
        toast.success('Cập nhật tài khoản thành công');
      } else {
        await authAPI.register({ username: newUsername, password: newPassword, displayName: newDisplayName, role: newRole });
        toast.success('Tạo tài khoản thành công');
      }
      const res = await authAPI.getUsers(); setUsers(res.data.users);
      setUserDialogOpen(false); resetUserForm();
    } catch (err: any) {
      setUserFormError(err.response?.data?.error || 'Lưu thất bại');
      toast.error(err.response?.data?.error || 'Lưu thất bại');
    }
    finally { setUserFormLoading(false); }
  };
  const handleDeleteUser = async (userId: string, username: string) => {
    if (username === 'admin') { toast.error('Không thể xóa admin'); return; }
    if (!confirm(`Xóa "${username}"?`)) return;
    try { await authAPI.deleteUser(userId); setUsers((p) => p.filter((u) => u._id !== userId)); toast.success('Xóa thành công'); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Xóa thất bại'); }
  };

  const resetClassForm = () => {
    setClassName(''); setClassDesc(''); setSelectedTeacher('');
    setClassFormError(''); setEditingClassroom(null);
    setSelectedMediaRoom(''); setSelectedMediaRoomName('');
    setRoomCameras([]);
  };
  const openEditClassroom = (c: any) => {
    setEditingClassroom(c); setClassName(c.name); setClassDesc(c.description || '');
    setSelectedTeacher(c.teacher?._id || '');

    setSelectedMediaRoom(c.mediaRoomId || '');
    setSelectedMediaRoomName(c.mediaRoomName || '');
    setClassDialogOpen(true);
    fetchMediaRooms();
    if (c.mediaRoomId) {
      fetchRoomCameras(c.mediaRoomId);
    }
  };

  const handleOpenClassDialog = () => {
    resetClassForm();
    setClassDialogOpen(true);
    fetchMediaRooms();
  };

  const handleSaveClassroom = async () => {
    if (!className || !selectedTeacher) { setClassFormError('Cần tên lớp và giáo viên'); return; }
    setClassFormError('');
    setClassFormLoading(true);
    try {
      const data = {
        name: className,
        description: classDesc,
        teacherId: selectedTeacher,

        mediaRoomId: selectedMediaRoom,
        mediaRoomName: selectedMediaRoomName,
      };
      if (editingClassroom) {
        await classroomAPI.update(editingClassroom._id, data);
        toast.success('Cập nhật lớp học thành công');
      }
      else {
        await classroomAPI.create(data);
        toast.success('Tạo lớp học mới thành công');
      }
      const res = await classroomAPI.list(); setClassrooms(res.data.classrooms);
      setClassDialogOpen(false); resetClassForm();
    } catch (err: any) {
      setClassFormError(err.response?.data?.error || 'Lỗi');
      toast.error(err.response?.data?.error || 'Lưu thất bại');
    } finally {
      setClassFormLoading(false);
    }
  };
  const handleDeleteClassroom = async (id: string, name: string) => {
    if (!confirm(`Xóa "${name}"?`)) return;
    try { await classroomAPI.delete(id); setClassrooms((p) => p.filter((c) => c._id !== id)); toast.success('Xóa thành công'); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Xóa thất bại'); }
  };


  const handleMediaRoomChange = (roomId: string) => {
    setSelectedMediaRoom(roomId);
    const room = mediaRooms.find(r => r.room_id === roomId);
    setSelectedMediaRoomName(room?.name || '');
    fetchRoomCameras(roomId);
  };

  const teachers = users.filter((u) => u.role === 'teacher');
  const students = users.filter((u) => u.role === 'student');
  const formatDT = (d: string) => d ? new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const getStatusBadge = (classStatus: string) => {
    switch (classStatus) {
      case 'live':
        return <Badge variant="default" className="font-normal gap-1.5 bg-emerald-600"><Radio className="h-3 w-3" /> Đang phát</Badge>;
      case 'ended':
        return <Badge variant="secondary" className="font-normal gap-1.5">Đã kết thúc</Badge>;
      case 'idle':
      default:
        return <Badge variant="outline" className="font-normal gap-1.5 text-amber-600 border-amber-300">Chưa mở</Badge>;
    }
  };

  if (user?.role !== 'admin') return <div className="flex items-center justify-center h-screen text-red-500">Chỉ admin</div>;

  return (
    <div className="flex h-screen bg-[#F9FAFB] text-slate-900 font-sans">
      {/* Sidebar - Clean, White, subtle border */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="h-16 flex items-center px-6 gap-3 border-b border-transparent">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <LayoutGrid size={16} className="text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight">Class Demo</span>
        </div>

        <div className="px-4 py-4 flex flex-col gap-1 flex-1">
          <Button
            variant="default"
            className="w-full justify-start shadow-sm bg-black text-white hover:bg-black/90 mb-6 rounded-lg h-10"
            onClick={() => activeSection === 'users' ? setUserDialogOpen(true) : handleOpenClassDialog()}
          >
            <Plus size={16} className="mr-2" /> Quick Create
          </Button>

          <span className="text-xs font-semibold text-slate-500 px-2 py-2">Management</span>

          <button
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeSection === 'users' ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
            onClick={() => setActiveSection('users')}
          >
            <Users size={16} className={activeSection === 'users' ? 'text-slate-900' : 'text-slate-500'} />
            Người dùng
          </button>

          <button
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeSection === 'classrooms' ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
            onClick={() => setActiveSection('classrooms')}
          >
            <School size={16} className={activeSection === 'classrooms' ? 'text-slate-900' : 'text-slate-500'} />
            Lớp học
          </button>
        </div>

        <div className="p-4 border-t border-slate-100 mt-auto">
          <button onClick={logout} className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
            <LogOut size={16} className="text-slate-500" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Header Bar */}
        <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center text-sm text-slate-500 gap-2">
            <LayoutGrid size={14} />
            <ChevronRight size={14} />
            <span className="font-medium text-slate-900">{activeSection === 'users' ? 'Quản lý Người dùng' : 'Quản lý Lớp học'}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50">
              <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700">{user?.displayName?.charAt(0)}</div>
              <span className="text-xs font-medium">{user?.displayName}</span>
            </div>
          </div>
        </header>

        <div className="p-8 max-w-6xl mx-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
              <div className="loading-spinner" /><p>Đang tải dữ liệu...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Users Section */}
              {activeSection === 'users' && (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-8">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{users.length}</div>
                        <p className="text-xs text-muted-foreground">Active accounts across platform</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Teachers</CardTitle>
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{teachers.length}</div>
                        <p className="text-xs text-muted-foreground">Registered educators</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Students</CardTitle>
                        <GraduationCap className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{students.length}</div>
                        <p className="text-xs text-muted-foreground">Enrolled learners</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div className="space-y-1">
                        <CardTitle>Danh sách Người dùng</CardTitle>
                        <CardDescription>Tất cả tài khoản hệ thống</CardDescription>
                      </div>
                      <Dialog open={userDialogOpen} onOpenChange={(v) => { setUserDialogOpen(v); if (!v) resetUserForm(); }}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm"><Plus className="h-4 w-4" /> Thêm mới</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                          <DialogHeader>
                            <DialogTitle>{editingUserId ? 'Chỉnh sửa người dùng' : 'Tạo người dùng mới'}</DialogTitle>
                            <DialogDescription>{editingUserId ? 'Chỉnh sửa thông tin tài khoản' : 'Điền thông tin để tạo tài khoản'}</DialogDescription>
                          </DialogHeader>
                          {userFormError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-md">{userFormError}</p>}
                          <div className="space-y-4 py-4">
                            <div className="space-y-2"><Label>Tên hiển thị</Label><Input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Nguyễn Văn A" /></div>
                            <div className="space-y-2"><Label>Username</Label><Input value={newUsername} disabled={!!editingUserId} onChange={(e) => setNewUsername(e.target.value)} placeholder="username" /></div>
                            <div className="space-y-2">
                              <Label>{editingUserId ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu'}</Label>
                              <div className="relative">
                                <Input type={showPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••" />
                                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-9 w-9 text-slate-500 hover:text-slate-700" onClick={() => setShowPassword(!showPassword)}>
                                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Vai trò</Label>
                              <Select value={newRole} onValueChange={setNewRole} disabled={!!(editingUserId && users.find(u => u._id === editingUserId)?.username === 'admin')}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="student">Học sinh</SelectItem><SelectItem value="teacher">Giáo viên</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
                              </Select>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Hủy</Button>
                            <Button onClick={handleSaveUser} disabled={userFormLoading}>{userFormLoading ? 'Đang lưu...' : 'Lưu'}</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Người dùng</TableHead>
                            <TableHead>Tài khoản</TableHead>
                            <TableHead>Vai trò</TableHead>
                            <TableHead>Ngày tạo</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.map((u) => (
                            <TableRow key={u._id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold">{u.displayName?.charAt(0)}</div>
                                  <span>{u.displayName}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{u.username}</TableCell>
                              <TableCell>
                                <Badge variant={u.role === 'admin' ? 'destructive' : u.role === 'teacher' ? 'default' : 'secondary'} className="font-normal capitalize">
                                  {u.role}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{formatDT(u.createdAt)}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {u.username !== 'admin' && (
                                    <Button variant="ghost" size="icon" onClick={() => openEditUser(u)}>
                                      <Pencil className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  )}
                                  {u.username !== 'admin' && (
                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(u._id, u.username)}>
                                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}

              {/* Classrooms Section */}
              {activeSection === 'classrooms' && (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-8">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Classrooms</CardTitle>
                        <School className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{classrooms.length}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Live Sessions</CardTitle>
                        <Video className="h-4 w-4 text-emerald-600" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-emerald-600">{classrooms.filter(c => c.classStatus === 'live').length}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Idle</CardTitle>
                        <Radio className="h-4 w-4 text-amber-500" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-amber-500">{classrooms.filter(c => c.classStatus === 'idle' || !c.classStatus).length}</div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div className="space-y-1">
                        <CardTitle>Danh sách Lớp học</CardTitle>
                        <CardDescription>Quản lý phiên học và phòng học</CardDescription>
                      </div>
                      <Dialog open={classDialogOpen} onOpenChange={(v) => { setClassDialogOpen(v); if (!v) resetClassForm(); }}>
                        <Button variant="outline" size="sm" onClick={handleOpenClassDialog}><Plus className="h-4 w-4" /> Tạo lớp học</Button>
                        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>{editingClassroom ? 'Sửa lớp học' : 'Tạo lớp học mới'}</DialogTitle>
                            <DialogDescription>Cấu hình thông tin và chọn phòng media</DialogDescription>
                          </DialogHeader>
                          {classFormError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-md">{classFormError}</p>}
                          <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2"><Label>Tên lớp</Label><Input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Toán 10A" /></div>
                              <div className="space-y-2"><Label>Giáo viên</Label>
                                <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                                  <SelectTrigger><SelectValue placeholder="Chọn giáo viên" /></SelectTrigger>
                                  <SelectContent>{teachers.map((t) => <SelectItem key={t._id} value={t._id}>{t.displayName}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-2"><Label>Mô tả ngắn</Label><Input value={classDesc} onChange={(e) => setClassDesc(e.target.value)} placeholder="Mô tả" /></div>

                            {/* Media Room Selection */}
                            <div className="space-y-3 border-t pt-4">
                              <Label className="flex items-center gap-2">
                                <Camera className="h-4 w-4" />
                                Media Room
                              </Label>
                              {mediaRoomsLoading ? (
                                <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh sách phòng...
                                </div>
                              ) : (
                                <Select value={selectedMediaRoom} onValueChange={handleMediaRoomChange}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Chọn phòng media" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {mediaRooms.map((room) => (
                                      <SelectItem key={room.room_id} value={room.room_id}>
                                        <div className="flex items-center gap-2">
                                          <span>{room.name}</span>
                                          {room.enabled ? (
                                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-300 text-emerald-600">Active</Badge>
                                          ) : (
                                            <Badge variant="outline" className="text-[9px] px-1 py-0">Disabled</Badge>
                                          )}
                                        </div>
                                      </SelectItem>
                                    ))}
                                    {mediaRooms.length === 0 && (
                                      <div className="px-3 py-2 text-sm text-slate-500">Không tìm thấy phòng media nào</div>
                                    )}
                                  </SelectContent>
                                </Select>
                              )}

                              {/* Show cameras preview */}
                              {selectedMediaRoom && (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-600">Cameras trong phòng</span>
                                    {camerasLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
                                  </div>
                                  {!camerasLoading && roomCameras.length > 0 ? (
                                    <div className="space-y-1">
                                      {roomCameras.map((cam) => (
                                        <div key={cam.camera_id} className="flex items-center gap-2 text-xs text-slate-600 bg-white rounded px-2 py-1.5 border border-slate-100">
                                          <Video className="h-3 w-3 text-slate-400" />
                                          <span className="font-medium">{cam.name || cam.camera_id}</span>
                                          {cam.description && <span className="text-slate-400">— {cam.description}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  ) : !camerasLoading ? (
                                    <p className="text-xs text-slate-400">Không tìm thấy camera nào</p>
                                  ) : null}
                                </div>
                              )}
                            </div>

                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setClassDialogOpen(false)}>Hủy</Button>
                            <Button onClick={handleSaveClassroom} disabled={classFormLoading}>
                              {classFormLoading ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Đang lưu...</>
                              ) : (
                                'Lưu thay đổi'
                              )}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Phòng học</TableHead>
                            <TableHead>Giáo viên</TableHead>
                            <TableHead>Media Room</TableHead>
                            <TableHead>HS / Cam</TableHead>
                            <TableHead>Trạng thái</TableHead>
                            <TableHead className="w-[100px] text-right"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {classrooms.map((c) => (
                            <TableRow key={c._id}>
                              <TableCell>
                                <div className="font-medium text-slate-900">{c.name}</div>
                                {c.description && <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{c.teacher?.displayName || '—'}</TableCell>
                              <TableCell>
                                {c.mediaRoomId ? (
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <Camera className="h-3 w-3 text-slate-400" />
                                    <span className="font-medium">{c.mediaRoomName || c.mediaRoomId}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="text-xs text-muted-foreground flex gap-3">
                                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {c.students?.length || 0}</span>
                                  <span className="flex items-center gap-1"><Video className="h-3 w-3" /> {c.cameras?.length || 0}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {getStatusBadge(c.classStatus || 'idle')}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEditClassroom(c)}>
                                    <Pencil className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteClassroom(c._id, c.name)}>
                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
