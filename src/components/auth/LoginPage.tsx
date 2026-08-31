import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCms } from '../../context/CmsContext';
import { api, setStoredToken } from '../../api/client';
import {
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Shield,
  Sparkles,
  User,
  Utensils,
  ConciergeBell,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { UserRole } from '../../types';

type Step = 'credentials' | 'otp' | 'forgot' | 'reset-otp' | 'reset-new' | 'success';

const ROLE_ICONS: Record<string, any> = {
  admin: Shield,
  manager: Building2,
  chef: Utensils,
  housekeeper: Sparkles,
  waiter: ConciergeBell,
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  manager: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  chef: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  housekeeper: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  waiter: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { getSetting } = useCms();
  const [step, setStep] = useState<Step>('credentials');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Credentials form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP form
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);
  const [userId, setUserId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [userFullName, setUserFullName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [otpPurpose, setOtpPurpose] = useState<'login' | 'password_reset'>('login');
  const [otpCountdown, setOtpCountdown] = useState(0);

  // Forgot password form
  const [resetEmail, setResetEmail] = useState('');
  const [resetUserId, setResetUserId] = useState('');
  const [resetMaskedEmail, setResetMaskedEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const startCountdown = () => {
    setOtpCountdown(60);
    const timer = setInterval(() => {
      setOtpCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login({ username, password });
      // Direct login mode (OTP disabled on backend) — backend now returns token immediately
      if (res.token) {
        setStoredToken(res.token);
        window.location.reload();
        return;
      }
      if (res.requiresOtp) {
        setUserId(res.userId);
        setMaskedEmail(res.email);
        setUserFullName(res.fullName);
        setUserRole(res.role);
        setOtpPurpose('login');
        setStep('otp');
        setOtpValues(['', '', '', '', '', '']);
        startCountdown();
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newValues = [...otpValues];
    newValues[index] = value;
    setOtpValues(newValues);
    // Auto-focus next input
    if (value && index < 5) {
      const next = document.getElementById(`otp-${index + 1}`);
      next?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      const prev = document.getElementById(`otp-${index - 1}`);
      prev?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const code = otpValues.join('');
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const res = await api.verifyOtp({ userId, otpCode: code, purpose: otpPurpose });
      if (res.token) {
        setStoredToken(res.token);
        window.location.reload();
      }
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
      setOtpValues(['', '', '', '', '', '']);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCountdown > 0) return;
    setError('');
    try {
      await api.resendOtp({ userId, purpose: otpPurpose });
      startCountdown();
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.forgotPassword(resetEmail);
      if (res.userId) {
        setResetUserId(res.userId);
        setResetMaskedEmail(res.email);
        setStep('reset-otp');
        setOtpValues(['', '', '', '', '', '']);
        startCountdown();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleResetOtpVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpValues.join('');
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }
    setStep('reset-new');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const code = otpValues.join('');
      await api.resetPassword({ userId: resetUserId, otpCode: code, newPassword });
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setStep('credentials');
    setError('');
    setOtpValues(['', '', '', '', '', '']);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="fixed inset-0 opacity-5">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(245,158,11,0.3) 1px, transparent 0)', backgroundSize: '48px 48px' }} />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-2xl shadow-amber-500/25 mb-4">
            <span className="text-3xl font-black text-slate-950 tracking-tighter">{getSetting('logo_text', 'GH')}</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{getSetting('site_title', 'Grand Horizon').split(' ').slice(0, -2).join(' ') || getSetting('site_title', 'Grand Horizon')}</h1>
          <p className="text-sm text-slate-400 mt-1">{getSetting('site_subtitle', 'Motel & Bistro')} Management System</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl p-8">
          {error && (
            <div className="mb-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm text-center">
              {error}
            </div>
          )}

          {/* Step: Credentials */}
          {step === 'credentials' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Sign In</h2>
                <p className="text-xs text-slate-400">Enter your credentials to access the system</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Username or Email</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition-all"
                    placeholder="Enter username or email"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition-all"
                    placeholder="Enter password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {loading ? 'Verifying...' : 'Continue'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('forgot'); setError(''); }}
                className="w-full text-center text-xs text-slate-400 hover:text-amber-400 transition-colors"
              >
                Forgot your password?
              </button>
            </form>
          )}

          {/* Step: OTP Verification */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="text-center">
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl border mb-3 ${ROLE_COLORS[userRole] || ROLE_COLORS.admin}`}>
                  {React.createElement(ROLE_ICONS[userRole] || Shield, { className: 'w-6 h-6' })}
                </div>
                <h2 className="text-lg font-bold text-white mb-1">Verify Your Identity</h2>
                <p className="text-xs text-slate-400">
                  We sent a 6-digit code to<br />
                  <span className="text-slate-300 font-medium">{maskedEmail}</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Signed in as <span className="text-slate-400">{userFullName}</span>
                </p>
              </div>

              <div className="flex justify-center gap-2">
                {otpValues.map((val, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={val}
                    onChange={(e) => handleOtpChange(i, e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-11 h-12 text-center text-lg font-bold bg-slate-800/60 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition-all"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={loading || otpValues.join('').length !== 6}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </button>

              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={goBack} className="text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
                  <ArrowLeft className="w-3 h-3" /> Back to login
                </button>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={otpCountdown > 0}
                  className="text-amber-400 hover:text-amber-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                >
                  {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          {/* Step: Forgot Password - Enter Email */}
          {step === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-3">
                  <Mail className="w-6 h-6 text-amber-400" />
                </div>
                <h2 className="text-lg font-bold text-white mb-1">Reset Password</h2>
                <p className="text-xs text-slate-400">Enter your email to receive a reset code</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition-all"
                    placeholder="your@email.com"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {loading ? 'Sending...' : 'Send Reset Code'}
              </button>

              <button type="button" onClick={goBack} className="w-full text-center text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1 transition-colors">
                <ArrowLeft className="w-3 h-3" /> Back to login
              </button>
            </form>
          )}

          {/* Step: Reset Password - Enter OTP */}
          {step === 'reset-otp' && (
            <form onSubmit={handleResetOtpVerify} className="space-y-5">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-3">
                  <KeyRound className="w-6 h-6 text-amber-400" />
                </div>
                <h2 className="text-lg font-bold text-white mb-1">Enter Reset Code</h2>
                <p className="text-xs text-slate-400">
                  Code sent to <span className="text-slate-300">{resetMaskedEmail}</span>
                </p>
              </div>

              <div className="flex justify-center gap-2">
                {otpValues.map((val, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={val}
                    onChange={(e) => handleOtpChange(i, e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-11 h-12 text-center text-lg font-bold bg-slate-800/60 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition-all"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={loading || otpValues.join('').length !== 6}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                Verify Code
              </button>

              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={goBack} className="text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
                  <ArrowLeft className="w-3 h-3" /> Back to login
                </button>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={otpCountdown > 0}
                  className="text-amber-400 hover:text-amber-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                >
                  {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          {/* Step: Reset Password - New Password */}
          {step === 'reset-new' && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-3">
                  <Lock className="w-6 h-6 text-emerald-400" />
                </div>
                <h2 className="text-lg font-bold text-white mb-1">Set New Password</h2>
                <p className="text-xs text-slate-400">Choose a strong password for your account</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition-all"
                    placeholder="At least 6 characters"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || newPassword.length < 6}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="text-center space-y-5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Password Reset!</h2>
                <p className="text-xs text-slate-400">Your password has been updated successfully.</p>
              </div>
              <button
                onClick={goBack}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Sign In
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
