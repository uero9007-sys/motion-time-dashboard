// ตัวกลางระหว่างระบบ Login กับ Dashboard: ตรวจ session → รับคำเชิญ → โหลดบริษัทที่เป็นสมาชิก → เปิด App
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import App from '../App';
import LoginPage from '../pages/LoginPage';
import { supabase } from '../lib/supabase';
import { authErrorMessage, loadSelectedOrgId, saveSelectedOrgId, type Membership, type OrgRole } from '../lib/auth';

type MembershipState = { userId: string; list: Membership[] } | { userId: string; error: string };

function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="sidebar-logo">MTS</span>
          <span className="sidebar-title">Motion &amp; Time Study</span>
        </div>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

function SetNewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(authErrorMessage(error.message));
    else onDone();
  };

  return (
    <AuthScreen title="ตั้งรหัสผ่านใหม่">
      <form onSubmit={submit} className="auth-form">
        <label>
          รหัสผ่านใหม่
          <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="auth-message auth-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่าน'}</button>
      </form>
    </AuthScreen>
  );
}

const signOut = () => supabase.auth.signOut();

export default function AuthGate() {
  // undefined = ยังไม่รู้ว่ามี session หรือไม่ (กำลังตรวจ)
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [memberships, setMemberships] = useState<MembershipState | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(loadSelectedOrgId);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  // ผูกกับ userId (ไม่ใช่ session) เพื่อไม่ให้โหลดใหม่ทุกครั้งที่ token ถูกต่ออายุ
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const accepted = await supabase.rpc('accept_invitations');
      if (accepted.error) console.error('Error accepting invitations:', accepted.error);

      const { data, error } = await supabase
        .from('organization_members')
        .select('role, organizations(id, name)')
        .eq('user_id', userId);
      if (cancelled) return;
      if (error) {
        console.error('Error loading memberships:', error);
        setMemberships({ userId, error: error.message });
        return;
      }
      const list = (data as unknown as { role: OrgRole; organizations: { id: string; name: string } }[])
        .map((m) => ({ id: m.organizations.id, name: m.organizations.name, role: m.role }))
        .sort((a, b) => a.name.localeCompare(b.name, 'th'));
      setMemberships({ userId, list });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  if (session === undefined) return <p className="auth-loading">กำลังโหลด...</p>;
  if (recovering && session) return <SetNewPassword onDone={() => setRecovering(false)} />;
  if (!session) return <LoginPage />;

  // ข้อมูลบริษัทของผู้ใช้คนก่อน (ถ้าสลับบัญชี) ถือว่ายังไม่โหลด
  const current = memberships?.userId === session.user.id ? memberships : null;
  if (!current) return <p className="auth-loading">กำลังโหลดข้อมูลบริษัท...</p>;

  const email = session.user.email ?? '';

  if ('error' in current) {
    return (
      <AuthScreen title="โหลดข้อมูลบริษัทไม่สำเร็จ">
        <p className="auth-message auth-error">{current.error}</p>
        <div className="auth-actions">
          <button className="btn btn-primary" onClick={() => setReloadKey((k) => k + 1)}>ลองใหม่</button>
          <button className="btn" onClick={signOut}>ออกจากระบบ</button>
        </div>
      </AuthScreen>
    );
  }

  if (current.list.length === 0) {
    return (
      <AuthScreen title="ยังไม่มีสิทธิ์เข้าถึง">
        <p>
          บัญชี <strong>{email}</strong> ยังไม่ได้เป็นสมาชิกของบริษัทใด ให้ผู้ดูแลบริษัทเชิญอีเมลนี้ในหน้า "สมาชิก"
          แล้วกด "ตรวจสอบอีกครั้ง"
        </p>
        <p className="auth-note">ถ้าได้รับเชิญด้วยอีเมลอื่น ให้ออกจากระบบแล้วเข้าใหม่ด้วยอีเมลนั้น</p>
        <div className="auth-actions">
          <button className="btn btn-primary" onClick={() => setReloadKey((k) => k + 1)}>ตรวจสอบอีกครั้ง</button>
          <button className="btn" onClick={signOut}>ออกจากระบบ</button>
        </div>
      </AuthScreen>
    );
  }

  const organization = current.list.find((m) => m.id === selectedOrgId) ?? current.list[0];
  const switchOrganization = (id: string) => {
    saveSelectedOrgId(id);
    setSelectedOrgId(id);
  };

  // key ทำให้ App เริ่มใหม่ทั้งหมดเมื่อสลับบริษัท ข้อมูลของบริษัทก่อนหน้าจึงไม่ค้างอยู่
  return (
    <App
      key={organization.id}
      organization={organization}
      account={{
        email,
        memberships: current.list,
        onSwitchOrganization: switchOrganization,
        onSignOut: signOut,
        onMembershipsChanged: () => setReloadKey((k) => k + 1),
      }}
    />
  );
}
