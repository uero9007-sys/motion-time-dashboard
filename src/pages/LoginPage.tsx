import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { authErrorMessage, authRedirectUrl } from '../lib/auth';

type Mode = 'password' | 'magic' | 'signup' | 'forgot';

type Status = { kind: 'idle' | 'busy' } | { kind: 'error' | 'sent'; message: string };

const TITLES: Record<Mode, string> = {
  password: 'เข้าสู่ระบบ',
  magic: 'เข้าสู่ระบบด้วยลิงก์ทางอีเมล',
  signup: 'สร้างบัญชีด้วยอีเมลที่ได้รับเชิญ',
  forgot: 'ตั้งรหัสผ่านใหม่',
};

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const switchMode = (next: Mode) => {
    setMode(next);
    setStatus({ kind: 'idle' });
  };

  const fail = (message: string) => setStatus({ kind: 'error', message: authErrorMessage(message) });

  const signInWithGoogle = async () => {
    setStatus({ kind: 'busy' });
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: authRedirectUrl() } });
    if (error) fail(error.message);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus({ kind: 'busy' });
    const address = email.trim();

    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email: address, password });
      // สำเร็จแล้ว AuthGate จะเปลี่ยนหน้าให้เอง
      if (error) fail(error.message);
      return;
    }

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: address,
        password,
        options: { emailRedirectTo: authRedirectUrl() },
      });
      if (error) return fail(error.message);
      if (!data.session) setStatus({ kind: 'sent', message: `ส่งลิงก์ยืนยันไปที่ ${address} แล้ว กดลิงก์ในอีเมลเพื่อเปิดใช้บัญชี` });
      return;
    }

    if (mode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({ email: address, options: { emailRedirectTo: authRedirectUrl() } });
      if (error) return fail(error.message);
      setStatus({ kind: 'sent', message: `ส่งลิงก์เข้าสู่ระบบไปที่ ${address} แล้ว เปิดอีเมลบนเครื่องนี้แล้วกดลิงก์` });
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: authRedirectUrl() });
    if (error) return fail(error.message);
    setStatus({ kind: 'sent', message: `ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${address} แล้ว` });
  };

  const busy = status.kind === 'busy';
  const needsPassword = mode === 'password' || mode === 'signup';

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="sidebar-logo">MTS</span>
          <span className="sidebar-title">Motion &amp; Time Study</span>
        </div>
        <h1>{TITLES[mode]}</h1>

        {(mode === 'password' || mode === 'magic') && (
          <>
            <button type="button" className="btn auth-google" onClick={signInWithGoogle} disabled={busy}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              เข้าสู่ระบบด้วย Google
            </button>
            <div className="auth-divider"><span>หรือ</span></div>
          </>
        )}

        <form onSubmit={submit} className="auth-form">
          <label>
            อีเมล
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {needsPassword && (
            <label>
              รหัสผ่าน
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}

          {status.kind === 'error' && <p className="auth-message auth-error" role="alert">{status.message}</p>}
          {status.kind === 'sent' && <p className="auth-message auth-success" role="status">{status.message}</p>}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'กำลังดำเนินการ...' : mode === 'password' ? 'เข้าสู่ระบบ' : mode === 'signup' ? 'สร้างบัญชี' : 'ส่งลิงก์'}
          </button>
        </form>

        <div className="auth-links">
          {mode === 'password' && (
            <>
              <button type="button" className="link-button" onClick={() => switchMode('magic')}>ไม่ใช้รหัสผ่าน (ส่งลิงก์ทางอีเมล)</button>
              <button type="button" className="link-button" onClick={() => switchMode('forgot')}>ลืมรหัสผ่าน</button>
              <button type="button" className="link-button" onClick={() => switchMode('signup')}>ได้รับเชิญแต่ยังไม่มีบัญชี</button>
            </>
          )}
          {mode !== 'password' && (
            <button type="button" className="link-button" onClick={() => switchMode('password')}>← กลับไปเข้าสู่ระบบด้วยรหัสผ่าน</button>
          )}
        </div>

        <p className="auth-note">ระบบนี้ใช้ได้เฉพาะผู้ที่ได้รับเชิญจากผู้ดูแลบริษัท</p>
      </div>
    </div>
  );
}
