import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Shield, Eye, EyeOff, Lock } from 'lucide-react';
import type { UserRole } from '@/types';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'super-admin', label: 'Super Admin' },
  { value: 'desk-in-charge', label: 'Desk In-Charge' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'department-head', label: 'Dept. Head' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('super-admin');

  if (isAuthenticated) {
    navigate('/dashboard');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password, selectedRole);
      navigate('/dashboard');
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (role: UserRole) => {
    setSelectedRole(role);
    setIsLoading(true);
    try {
      await login('', '', role);
      navigate('/dashboard');
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#2D5A45] rounded-xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Jalsa Guest</h1>
          <p className="text-[#4A4A4A]">Jalsa Salana Jalsa Salana UK</p>
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
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#1A1A1A]">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@organization.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45]"
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

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="remember"
                    className="rounded border-[#D4CFC7] text-[#2D5A45] focus:ring-[#2D5A45]"
                  />
                  <Label htmlFor="remember" className="text-sm text-[#4A4A4A]">Remember me</Label>
                </div>
                <button type="button" className="text-sm text-[#2D5A45] hover:underline">
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#2D5A45] hover:bg-[#234839] text-white"
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-[#E8E3DB]">
              <p className="text-xs text-[#4A4A4A] mb-3 uppercase tracking-wide">Quick Login (Demo)</p>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_OPTIONS.map((role) => (
                  <Button
                    key={role.value}
                    type="button"
                    variant="outline"
                    onClick={() => handleQuickLogin(role.value)}
                    disabled={isLoading}
                    className={`text-xs border-[#D4CFC7] ${
                      selectedRole === role.value
                        ? 'bg-[#2D5A45] text-white hover:bg-[#234839]'
                        : 'text-[#4A4A4A] hover:bg-[#E8F5EE]'
                    }`}
                  >
                    {role.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-[#4A4A4A] mt-2 text-center">
                MFA Code: 123456 (any 6 digits starting with 1)
              </p>
            </div>
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
