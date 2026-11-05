// ตัวกลางระหว่างระบบ Login กับ Dashboard: ตรวจ session → รับคำเชิญ → โหลดบริษัทที่เป็นสมาชิก → เปิด App
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import App from '../App';
import LoginPage from '../pages/LoginPage';
import { supabase } from '../lib/supabase';
import { authErrorMessage, loadSelectedOrgId, MIN_PASSWORD_LENGTH, saveSelectedOrgId, type Membership, type OrgRole } from '../lib/auth';
import {
  formatInviteCode,
  INVITE_CODE_LENGTH,
  joinErrorMessage,
  normalizeInviteCode,
  parseJoinResult,
  peekPendingInvite,
  rpcErrorMessage,
  takePendingInvite,
} from '../lib/invite';

type JoinNotice = { kind: 'success' | 'error'; text: string; orgId?: string };

type MembershipState = { userId: string; list: Membership[]; fullName: string } | { userId: string; error: string };

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
          <input type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
  const joinRef = useRef<JoinNotice | null>(null);
  const [joinNotice, setJoinNotice] = useState<JoinNotice | null>(null);

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

      // เปิดมาจาก QR (/join) แล้ว Login → เข้าร่วมทีมให้อัตโนมัติ
      // เก็บผลไว้ใน ref เพราะ StrictMode รัน effect ซ้ำ รอบสองจะไม่เจอรหัสแล้ว (ถูกล้างไปตั้งแต่รอบแรก)
      const pending = takePendingInvite();
      if (pending) {
        const { data, error } = await supabase.rpc('join_organization', { p_code: pending });
        const result = error ? null : parseJoinResult(data);
        joinRef.current = error
          ? { kind: 'error', text: rpcErrorMessage(error.message) }
          : result!.ok
            ? { kind: 'success', text: `เข้าร่วม "${result!.organizationName}" แล้ว`, orgId: result!.organizationId }
            : result!.reason === 'already_member'
              ? { kind: 'success', text: joinErrorMessage(result!), orgId: result!.organizationId }
              : { kind: 'error', text: joinErrorMessage(result!) };
      }

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

      // ชื่อที่แสดงใน Sidebar ไม่มีก็ไม่เป็นไร (เช่น ยังไม่ได้รัน migration ขั้นที่ 5) จึงไม่ถือเป็น error
      const profile = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
      if (cancelled) return;
      const joined = joinRef.current;
      if (joined) {
        joinRef.current = null;
        setJoinNotice(joined);
        if (joined.orgId) {
          saveSelectedOrgId(joined.orgId);
          setSelectedOrgId(joined.orgId);
        }
      }
      setMemberships({ userId, list, fullName: profile.data?.full_name ?? '' });
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
      <AuthScreen title="ยังไม่มีพื้นที่ทำงาน">
        <p>
          บัญชี <strong>{email}</strong> ยังไม่ได้อยู่ในทีมใด เข้าร่วมทีมด้วยรหัสเชิญ หรือสร้างองค์กรของตัวเอง
        </p>
        {joinNotice?.kind === 'error' && <p className="auth-message auth-error">{joinNotice.text}</p>}
        <JoinOrCreate
          onDone={(orgId) => {
            saveSelectedOrgId(orgId);
            setSelectedOrgId(orgId);
            setReloadKey((k) => k + 1);
          }}
        />
        <div className="auth-actions">
          <button className="btn" onClick={() => setReloadKey((k) => k + 1)}>ตรวจสอบอีกครั้ง</button>
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
    <>
      {joinNotice && (
        <div className={`join-toast ${joinNotice.kind === 'error' ? 'auth-error' : 'auth-success'}`} role="status">
          <span>{joinNotice.text}</span>
          <button type="button" className="link-button" onClick={() => setJoinNotice(null)}>ปิด</button>
        </div>
      )}
      <App
        key={organization.id}
        organization={organization}
        account={{
          email,
          fullName: current.fullName,
          memberships: current.list,
          onSwitchOrganization: switchOrganization,
          onSignOut: signOut,
          onMembershipsChanged: () => setReloadKey((k) => k + 1),
        }}
      />
    </>
  );
}

// ทางเข้าสำหรับบัญชีที่ยังไม่มีทีม: กรอกรหัสเชิญ หรือสร้างองค์กรใหม่
function JoinOrCreate({ onDone }: { onDone: (organizationId: string) => void }) {
  const [code, setCode] = useState(() => formatInviteCode(peekPendingInvite()));
  const [orgName, setOrgName] = useState('');
  const [busy, setBusy] = useState<'join' | 'create' | null>(null);
  const [error, setError] = useState('');

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (normalizeInviteCode(code).length !== INVITE_CODE_LENGTH) {
      setError(`รหัสเชิญต้องมี ${INVITE_CODE_LENGTH} ตัวอักษร (เช่น ABCDE-FGHJK)`);
      return;
    }
    setBusy('join');
    setError('');
    const { data, error: rpcError } = await supabase.rpc('join_organization', { p_code: normalizeInviteCode(code) });
    setBusy(null);
    if (rpcError) return setError(rpcErrorMessage(rpcError.message));
    const result = parseJoinResult(data);
    if (result.ok) return onDone(result.organizationId);
    if (result.reason === 'already_member' && result.organizationId) return onDone(result.organizationId);
    setError(joinErrorMessage(result));
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return setError('กรุณากรอกชื่อองค์กร');
    setBusy('create');
    setError('');
    const { data, error: rpcError } = await supabase.rpc('create_organization', { p_name: orgName.trim() });
    setBusy(null);
    if (rpcError) return setError(rpcErrorMessage(rpcError.message));
    onDone(data as string);
  };

  return (
    <div className="join-or-create">
      <form onSubmit={join} className="auth-form">
        <label>
          รหัสเชิญ
          <input id="join-code" autoComplete="off" placeholder="ABCDE-FGHJK" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy !== null}>
          {busy === 'join' ? 'กำลังเข้าร่วม...' : 'เข้าร่วมทีม'}
        </button>
      </form>
      <div className="auth-divider"><span>หรือ</span></div>
      <form onSubmit={create} className="auth-form">
        <label>
          ชื่อองค์กรใหม่
          <input id="create-org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={busy !== null}>
          {busy === 'create' ? 'กำลังสร้าง...' : 'สร้างองค์กร'}
        </button>
      </form>
      {error && <p className="auth-message auth-error" role="alert">{error}</p>}
    </div>
  );
}
