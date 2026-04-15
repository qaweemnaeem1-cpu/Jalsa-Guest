import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Shield, Eye, EyeOff, Lock, AlertCircle, Car, Mail } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, authError } = useAuth();
  const isMobile = useIsMobile();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  if (isAuthenticated) {
    navigate('/dashboard');
    return null;
  }

  const error = localError || authError || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (!email || !password) {
      setLocalError('Please enter your email and password.');
      return;
    }
    setIsLoading(true);
    const success = await login(email, password);
    setIsLoading(false);
    if (success) navigate('/dashboard');
  };

  // ── Mobile layout ──────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="min-h-screen bg-[#2D5A45] flex flex-col">
        {/* Top branding area */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">
          <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mb-5">
            <Car className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-widest uppercase">Jalsa Guest</h1>
          <p className="text-sm text-white/60 mt-1 tracking-wide">Transport</p>
        </div>

        {/* White card form */}
        <div className="bg-white rounded-t-3xl px-6 pt-8 pb-10" style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}>
          <h2 className="text-xl font-bold text-[#1A1A1A] mb-1">Sign in</h2>
          <p className="text-sm text-[#4A4A4A] mb-6">Enter your driver credentials</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Email */}
            <div>
              <Label htmlFor="email-mobile" className="text-[#1A1A1A] text-sm font-medium mb-1 block">
                Email address
              </Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A4A4A]" />
                <input
                  id="email-mobile"
                  type="email"
                  placeholder="name@organization.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full pl-12 pr-4 py-4 text-base rounded-xl border border-[#D4CFC7] bg-[#F5F0E8] text-[#1A1A1A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2D5A45] focus:ring-2 focus:ring-[#2D5A45]/20"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <Label htmlFor="password-mobile" className="text-[#1A1A1A] text-sm font-medium mb-1 block">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A4A4A]" />
                <input
                  id="password-mobile"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full pl-12 pr-12 py-4 text-base rounded-xl border border-[#D4CFC7] bg-[#F5F0E8] text-[#1A1A1A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2D5A45] focus:ring-2 focus:ring-[#2D5A45]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#4A4A4A]"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2 text-sm text-[#4A4A4A] cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 rounded border-[#D4CFC7] accent-[#2D5A45]" />
              Remember me
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 text-lg font-bold bg-[#2D5A45] hover:bg-[#234839] active:bg-[#1a3329] text-white rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Desktop layout (unchanged) ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#2D5A45] rounded-xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Jalsa Guest</h1>
          <p className="text-[#4A4A4A]">Jalsa Salana UK</p>
        </div>

        <Card className="border-[#E8E3DB] shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-[#1A1A1A]">Sign in to your account</CardTitle>
            <CardDescription className="text-[#4A4A4A]">
              Enter your credentials to access the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#1A1A1A]">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@organization.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45]"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#1A1A1A]">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A4A4A] hover:text-[#1A1A1A]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#2D5A45] hover:bg-[#234839] text-white"
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-[#4A4A4A]">
            <Lock className="w-4 h-4" />
            <span>Protected by enterprise-grade security.</span>
          </div>
          <p className="text-xs text-[#4A4A4A] mt-1">
            Unauthorized access is prohibited.
          </p>
        </div>
      </div>
    </div>
  );
}
