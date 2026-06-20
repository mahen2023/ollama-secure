import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Eye, EyeOff, Loader2, User, Lock } from 'lucide-react';
import { useStore } from '../../store';
import { login, register } from '../../api/auth';

function Field({ label, icon: Icon, type, value, onChange, placeholder, error }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div>
      <label className="block text-sm font-medium text-[#adadad] mb-1.5">
        <Icon className="w-3.5 h-3.5 inline mr-1.5 text-[#10a37f]" />
        {label}
      </label>
      <div className="relative">
        <input
          type={isPassword && show ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={isPassword ? 'current-password' : 'username'}
          className={`w-full bg-[#212121] border text-white rounded-xl px-4 py-3 text-sm
                      focus:outline-none placeholder-[#555] transition-colors
                      ${error ? 'border-red-500/50 focus:border-red-400' : 'border-[#3a3a3a] focus:border-[#10a37f]'}
                      ${isPassword ? 'pr-11' : ''}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#8e8ea0]"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [tab, setTab]           = useState('login');   // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const { setAuth } = useStore();
  const navigate = useNavigate();

  const reset = (newTab) => {
    setTab(newTab);
    setError('');
    setUsername('');
    setPassword('');
    setConfirm('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) return;

    if (tab === 'register') {
      if (password.length < 6) return setError('Password must be at least 6 characters');
      if (password !== confirm) return setError('Passwords do not match');
    }

    setLoading(true);
    try {
      const data = tab === 'login'
        ? await login(username.trim(), password)
        : await register(username.trim(), password);
      setAuth(data);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#212121] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-[#10a37f] to-[#1a7f64] rounded-2xl
                          flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Bot className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-white">Ollama Chat</h1>
          <p className="text-[#8e8ea0] text-sm mt-1">Your private AI assistant</p>
        </div>

        {/* Card */}
        <div className="bg-[#2a2a2a] border border-[#3a3a3a] rounded-2xl overflow-hidden shadow-xl">
          {/* Tabs */}
          <div className="flex border-b border-[#3a3a3a]">
            {['login', 'register'].map((t) => (
              <button
                key={t}
                onClick={() => reset(t)}
                className={`flex-1 py-3 text-sm font-medium transition-colors capitalize
                  ${tab === t
                    ? 'text-white border-b-2 border-[#10a37f] bg-[#2f2f2f]'
                    : 'text-[#8e8ea0] hover:text-white'}`}
              >
                {t === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <Field
              label="Username"
              icon={User}
              type="text"
              value={username}
              onChange={setUsername}
              placeholder="your_username"
              error={false}
            />
            <Field
              label="Password"
              icon={Lock}
              type="password"
              value={password}
              onChange={setPassword}
              placeholder={tab === 'register' ? 'Min 6 characters' : 'Enter your password'}
              error={!!error && error.toLowerCase().includes('password')}
            />
            {tab === 'register' && (
              <Field
                label="Confirm password"
                icon={Lock}
                type="password"
                value={confirm}
                onChange={setConfirm}
                placeholder="Repeat your password"
                error={!!error && error.toLowerCase().includes('match')}
              />
            )}

            {error && (
              <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full bg-[#10a37f] hover:bg-[#0d9270] disabled:opacity-50 disabled:cursor-not-allowed
                         text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {tab === 'login' ? 'Signing in…' : 'Creating account…'}</>
              ) : (
                tab === 'login' ? 'Sign in' : 'Create account'
              )}
            </button>
          </form>
        </div>
        <p className="text-center text-[#555] text-xs mt-4">
          Credentials are stored securely in MongoDB
        </p>
      </div>
    </div>
  );
}
