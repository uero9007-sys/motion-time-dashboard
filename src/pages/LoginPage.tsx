import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { authErrorMessage, authRedirectUrl, MIN_PASSWORD_LENGTH } from '../lib/auth';

type Mode = 'password' | 'signup' | 'magic' | 'forgot';
type Workspace = 'personal' | 'company';

type Status = { kind: 'idle' | 'busy' } | { kind: 'error' | 'sent'; message: string };

const TITLES: Record<Mode, string> = {
  password: 'เข้าสู่ระบบ',
  signup: 'สมัครสมาชิก',
  magic: 'เข้าสู่ระบบด้วยลิงก์ทางอีเมล',
  forgot: 'ตั้งรหัสผ่านใหม่',
};

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('password');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [workspace, setWorkspace] = useState<Workspace>('personal');
  const [companyName, setCompanyName] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const switchMode = (next: Mode) => {
    setMode(next);
    setStatus({ kind: 'idle' });
  };

  const fail = (message: string) => setStatus({ kind: 'error', message: authErrorMessage(message) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();

    if (mode === 'signup') {
      // ตรวจในหน้าเว็บก่อนเพื่อบอกผู้ใช้เร็วๆ (Supabase ตรวจซ้ำฝั่งเซิร์ฟเวอร์อีกครั้ง)
      if (!fullName.trim()) return fail('กรุณากรอกชื่อ-นามสกุล');
      if (password.length < MIN_PASSWORD_LENGTH) return fail(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
      if (password !== confirmPassword) return fail('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      if (workspace === 'company' && !companyName.trim()) return fail('กรุณากรอกชื่อบริษัท');
    }

    setStatus({ kind: 'busy' });

    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email: address, password });
      // สำเร็จแล้ว AuthGate จะเปลี่ยนหน้าให้เอง
      if (error) fail(error.message);
      return;
    }

    if (mode === 'signup') {
      // ค่าใน data ไปอยู่ใน raw_user_meta_data แล้ว trigger handle_new_user ใช้สร้าง profile และพื้นที่ทำงาน
      const { data, error } = await supabase.auth.signUp({
        email: address,
        password,
        options: {
          emailRedirectTo: authRedirectUrl(),
          data: {
            full_name: fullName.trim(),
            workspace_type: workspace,
            company_name: workspace === 'company' ? companyName.trim() : '',
          },
        },
      });
      if (error) return fail(error.message);
      // ปิด "Confirm email" ใน Supabase แล้ว จะได้ session ทันทีและ AuthGate พาเข้า Dashboard เอง
      if (!data.session) setStatus({ kind: 'sent', message: `ส่งลิงก์ยืนยันไปที่ ${address} แล้ว กดลิงก์ในอีเมลเพื่อเปิดใช้บัญชี` });
      return;
    }

    if (mode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: authRedirectUrl() },
      });
      if (error) return fail(error.message);
      setStatus({ kind: 'sent', message: `ส่งลิงก์เข้าสู่ระบบไปที่ ${address} แล้ว เปิดอีเมลบนเครื่องนี้แล้วกดลิงก์` });
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: authRedirectUrl() });
    if (error) return fail(error.message);
    setStatus({ kind: 'sent', message: `ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${address} แล้ว` });
  };

  const busy = status.kind === 'busy';
  const isSignup = mode === 'signup';
  const needsPassword = mode === 'password' || isSignup;

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="sidebar-logo">MTS</span>
          <span className="sidebar-title">Motion &amp; Time Study</span>
        </div>

        {(mode === 'password' || isSignup) && (
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'password'} className={mode === 'password' ? 'active' : ''} onClick={() => switchMode('password')}>
              เข้าสู่ระบบ
            </button>
            <button type="button" role="tab" aria-selected={isSignup} className={isSignup ? 'active' : ''} onClick={() => switchMode('signup')}>
              สมัครสมาชิก
            </button>
          </div>
        )}

        <h1>{TITLES[mode]}</h1>

        <form onSubmit={submit} className="auth-form" noValidate>
          {isSignup && (
            <label>
              ชื่อ-นามสกุล
              <input id="signup-name" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
          )}
          <label>
            อีเมล
            <input id="auth-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {needsPassword && (
            <label>
              รหัสผ่าน
              <input
                id="auth-password"
                type="password"
                required
                minLength={isSignup ? MIN_PASSWORD_LENGTH : undefined}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {isSignup && <span className="auth-hint">อย่างน้อย {MIN_PASSWORD_LENGTH} ตัวอักษร</span>}
            </label>
          )}
          {isSignup && (
            <>
              <label>
                ยืนยันรหัสผ่าน
                <input
                  id="signup-confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </label>

              <fieldset className="auth-choice">
                <legend>ใช้งานแบบไหน</legend>
                <label className="auth-choice-option">
                  <input type="radio" name="workspace" id="ws-personal" checked={workspace === 'personal'} onChange={() => setWorkspace('personal')} />
                  <span>
                    <b>ใช้งานส่วนตัว</b>
                    <small>ข้อมูลเห็นได้เฉพาะบัญชีนี้</small>
                  </span>
                </label>
                <label className="auth-choice-option">
                  <input type="radio" name="workspace" id="ws-company" checked={workspace === 'company'} onChange={() => setWorkspace('company')} />
                  <span>
                    <b>สร้างบริษัท (Co-work)</b>
                    <small>เชิญเพื่อนร่วมงานเข้ามาดูและบันทึกข้อมูลร่วมกันได้ในหน้า "สมาชิก"</small>
                  </span>
                </label>
              </fieldset>

              {workspace === 'company' && (
                <label>
                  ชื่อบริษัท / ทีม
                  <input id="signup-company" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </label>
              )}
            </>
          )}

          {status.kind === 'error' && <p className="auth-message auth-error" role="alert">{status.message}</p>}
          {status.kind === 'sent' && <p className="auth-message auth-success" role="status">{status.message}</p>}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'กำลังดำเนินการ...' : mode === 'password' ? 'เข้าสู่ระบบ' : isSignup ? 'สมัครและเข้าใช้งาน' : 'ส่งลิงก์'}
          </button>
        </form>

        <div className="auth-links">
          {mode === 'password' && (
            <>
              <button type="button" className="link-button" onClick={() => switchMode('forgot')}>ลืมรหัสผ่าน</button>
              <button type="button" className="link-button" onClick={() => switchMode('magic')}>ไม่ใช้รหัสผ่าน (ส่งลิงก์ทางอีเมล)</button>
            </>
          )}
          {(mode === 'magic' || mode === 'forgot') && (
            <button type="button" className="link-button" onClick={() => switchMode('password')}>← กลับไปเข้าสู่ระบบด้วยรหัสผ่าน</button>
          )}
        </div>

        <p className="auth-note">
          {isSignup
            ? 'ถ้าถูกเชิญเข้าบริษัทไว้แล้ว ให้สมัครด้วยอีเมลที่ได้รับเชิญ ระบบจะพาเข้าบริษัทนั้นให้อัตโนมัติ'
            : 'บัญชีเดียวกันใช้ได้ทั้ง Dashboard และแอปมือถือ'}
        </p>
      </div>
    </div>
  );
}
