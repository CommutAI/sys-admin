import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Lock, Mail, Bus, Eye, EyeOff } from 'lucide-react';
import AuditService from '../services/auditService';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        // Log login event to audit logs
        await AuditService.logLogin(email);
        navigate('/');
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setResetSuccess(true);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="glass-card p-8 rounded-2xl w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img 
            src="/logo.png" 
            alt="CommutAI Logo" 
            className="w-24 h-24 mb-4"
          />
          <h1 className="text-white text-2xl font-bold">CommutAI</h1>
          <p className="text-white/60 text-sm">System Admin Portal</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="text-white/60 text-sm mb-2 block">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
                placeholder="admin@commutai.com"
              />
            </div>
          </div>

          <div>
            <label className="text-white/60 text-sm mb-2 block">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-12 py-3 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <Bus size={20} />
                Sign In
              </>
            )}
          </button>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setResetMode(true)}
              className="text-white/60 hover:text-orange-400 text-sm transition-colors"
            >
              Forgot password?
            </button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <p className="text-white/40 text-xs">
            Secure access to CommutAI administration system
          </p>
        </div>
      </div>
    </div>
  );

  if (resetMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="glass-card p-8 rounded-2xl w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <img 
              src="/logo.png" 
              alt="CommutAI Logo" 
              className="w-24 h-24 mb-4"
            />
            <h1 className="text-white text-2xl font-bold">Reset Password</h1>
            <p className="text-white/60 text-sm">Enter your email to receive a reset link</p>
          </div>

          {resetSuccess ? (
            <div className="text-center">
              <div className="bg-green-500/20 border border-green-500/50 text-green-400 px-4 py-3 rounded-xl mb-4">
                Password reset email sent! Check your inbox.
              </div>
              <button
                onClick={() => setResetMode(false)}
                className="text-orange-400 hover:text-orange-300 text-sm"
              >
                Back to login
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasswordReset} className="space-y-6">
              {error && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="text-white/60 text-sm mb-2 block">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setResetMode(false)}
                  className="text-white/60 hover:text-orange-400 text-sm transition-colors"
                >
                  Back to login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }
};

export default Login;
