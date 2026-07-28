import { useState, type FC } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, Chrome, Loader2, AlertCircle } from 'lucide-react';
import logoSrc from '/logo.png';

export const AuthScreen: FC = () => {
  const { login, register, loginWithGoogle, loginWithGoogleRedirect } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) { setError('Email and password are required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/user-not-found') setError('No account found with this email.');
      else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') setError('Incorrect password.');
      else if (code === 'auth/email-already-in-use') setError('An account already exists with this email.');
      else if (code === 'auth/too-many-requests') setError('Too many attempts. Try again later.');
      else setError(err?.message || 'Authentication failed.');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#0F1115] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background logo watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <img src={logoSrc} alt="" className="w-[32rem] sm:w-[40rem] h-auto opacity-[0.04]" />
      </div>

      <div className="w-full max-w-sm space-y-6 relative z-10">
        <div className="text-center space-y-2">
          <h1 className="text-sm font-bold text-white font-mono uppercase tracking-widest">CardifyA.I</h1>
          <p className="text-xs text-[#8B949E] font-mono">{mode === 'login' ? 'Sign in to continue' : 'Create your account'}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[9px] font-mono tracking-wider text-[#8B949E] uppercase block font-bold">Email</label>
            <div className="relative">
              <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E]" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@gmail.com"
                className="w-full pl-9 pr-3 py-2 rounded border border-[#30363D] bg-[#161B22] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-mono tracking-wider text-[#8B949E] uppercase block font-bold">Password</label>
            <div className="relative">
              <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E]" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters"
                className="w-full pl-9 pr-3 py-2 rounded border border-[#30363D] bg-[#161B22] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600" />
            </div>
          </div>

          {error && (
            <div className="flex items-center space-x-1.5 text-[#F85149] text-xs bg-[#F85149]/10 p-2 rounded border border-[#F85149]/20">
              <AlertCircle size={12} /><span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={busy}
            className="w-full py-2 bg-[#E3B341] hover:bg-[#F0C24F] disabled:bg-[#2D333B] disabled:text-[#484F58] text-[#0F1115] text-xs font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed">
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}
            <span>{busy ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}</span>
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#2D333B]"></div></div>
          <div className="relative flex justify-center"><span className="px-2 bg-[#0F1115] text-[9px] font-mono text-[#8B949E]">OR</span></div>
        </div>

        <button onClick={loginWithGoogle} disabled={busy}
          className="w-full py-2 bg-[#161B22] hover:bg-[#21262D] disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded border border-[#30363D] transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed">
          <Chrome size={14} /><span>Sign in with Google</span>
        </button>

        <p className="text-center">
          <button onClick={loginWithGoogleRedirect}
            className="text-[10px] font-mono text-[#8B949E] hover:text-[#E3B341] transition-colors cursor-pointer underline underline-offset-2 decoration-[#30363D]">
            Popup not working? Use redirect instead
          </button>
        </p>

        <p className="text-center text-[10px] font-mono text-[#8B949E]">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); }}
            className="text-[#E3B341] hover:underline cursor-pointer">{mode === 'login' ? 'Register' : 'Sign In'}</button>
        </p>
      </div>
    </div>
  );
};
