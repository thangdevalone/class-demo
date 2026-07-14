import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const queryParams = new URLSearchParams(location.search);
  const defaultTab = queryParams.get('tab') === 'signup' ? 'signup' : 'login';

  const [activeTab, setActiveTab] = useState(defaultTab);

  // Login State
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Signup State
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupDisplayName, setSignupDisplayName] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      await login(loginUsername, loginPassword);
      // login context will handle navigation via protected routes
    } catch (err: any) {
      setLoginError(err.response?.data?.error || 'Tài khoản hoặc mật khẩu không chính xác');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError('');
    setSignupLoading(true);
    try {
      await authAPI.signup({
        username: signupUsername,
        password: signupPassword,
        displayName: signupDisplayName
      });
      // automatically login after signup
      await login(signupUsername, signupPassword);
    } catch (err: any) {
      setSignupError(err.response?.data?.error || 'Đăng ký thất bại');
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 bg-black text-white rounded-xl flex items-center justify-center shadow-lg">
            <BookOpen className="h-6 w-6" />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="login">Đăng nhập</TabsTrigger>
            <TabsTrigger value="signup">Đăng ký</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl text-center">Chào mừng trở lại</CardTitle>
                <CardDescription className="text-center">Nhập thông tin để tiếp tục</CardDescription>
              </CardHeader>
              <form onSubmit={handleLogin} className="flex flex-col gap-6">
                <CardContent className="space-y-4 pb-0">
                  {loginError && <div className="text-sm text-red-500 bg-red-50 p-3 rounded-md">{loginError}</div>}
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" type="text" placeholder="Tên đăng nhập" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Mật khẩu</Label>
                    <div className="relative">
                      <Input id="password" type={showLoginPassword ? "text" : "password"} placeholder="••••••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
                      <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-9 w-9 text-slate-500 hover:text-slate-700" onClick={() => setShowLoginPassword(!showLoginPassword)}>
                        {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={loginLoading}>
                    {loginLoading ? 'Đang xử lý...' : 'Đăng nhập'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="signup">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl text-center">Tạo tài khoản</CardTitle>
                <CardDescription className="text-center">Tham gia lớp học ngay hôm nay</CardDescription>
              </CardHeader>
              <form onSubmit={handleSignup} className="flex flex-col gap-6">
                <CardContent className="space-y-4 pb-0">
                  {signupError && <div className="text-sm text-red-500 bg-red-50 p-3 rounded-md">{signupError}</div>}
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Tên hiển thị</Label>
                    <Input id="displayName" type="text" placeholder="Nguyễn Văn A" value={signupDisplayName} onChange={(e) => setSignupDisplayName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-username">Username</Label>
                    <Input id="reg-username" type="text" placeholder="Tên đăng nhập" value={signupUsername} onChange={(e) => setSignupUsername(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Mật khẩu</Label>
                    <div className="relative">
                      <Input id="reg-password" type={showSignupPassword ? "text" : "password"} placeholder="••••••••" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required minLength={6} />
                      <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-9 w-9 text-slate-500 hover:text-slate-700" onClick={() => setShowSignupPassword(!showSignupPassword)}>
                        {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={signupLoading}>
                    {signupLoading ? 'Đang tạo...' : 'Đăng ký'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-8 text-center text-sm text-slate-500">
          <p>&copy; 2026 Test Education. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
