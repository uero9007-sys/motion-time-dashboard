import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import {
  ROLE_HINTS,
  ROLE_LABELS,
  authRedirectUrl,
  canManageMembers,
  type Account,
  type Membership,
  type OrgRole,
} from '../lib/auth';

type Member = { user_id: string; email: string; role: OrgRole; created_at: string };
type Invitation = { id: string; email: string; role: OrgRole; created_at: string };

type Props = {
  organization: Membership;
  account: Account;
};

const ALL_ROLES: OrgRole[] = ['owner', 'admin', 'member', 'viewer'];
const formatDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

export default function MembersPage({ organization, account }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('member');
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const isAdmin = canManageMembers(organization.role);
  const isOwner = organization.role === 'owner';
  // Admin แต่งตั้งหรือแก้ไข Owner ไม่ได้ (ฐานข้อมูลก็ตรวจซ้ำอีกชั้น)
  const assignableRoles = ALL_ROLES.filter((r) => isOwner || r !== 'owner');
  const loginUrl = authRedirectUrl();

  const load = useCallback(async () => {
    const [memberResult, invitationResult] = await Promise.all([
      supabase.rpc('list_organization_members', { org: organization.id }),
      isAdmin
        ? supabase
            .from('invitations')
            .select('id, email, role, created_at')
            .eq('organization_id', organization.id)
            .is('accepted_at', null)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (memberResult.error) setMessage({ kind: 'error', text: `โหลดรายชื่อสมาชิกไม่สำเร็จ: ${memberResult.error.message}` });
    else setMembers(memberResult.data as Member[]);
    if (invitationResult.error) setMessage({ kind: 'error', text: `โหลดคำเชิญไม่สำเร็จ: ${invitationResult.error.message}` });
    else setInvitations((invitationResult.data ?? []) as Invitation[]);
    setIsLoading(false);
  }, [organization.id, isAdmin]);

  useEffect(() => {
    // setState ใน load เกิดหลัง await เท่านั้น
    // oxlint-disable-next-line react/set-state-in-effect
    load();
  }, [load]);

  // ทุกการแก้ไขผ่าน run: แสดงผลลัพธ์ แล้วโหลดรายชื่อใหม่
  const run = async (action: () => PromiseLike<{ error: { message: string } | null }>, success: string) => {
    setMessage(null);
    const { error } = await action();
    if (error) {
      setMessage({ kind: 'error', text: error.message.includes('duplicate key') ? 'อีเมลนี้ได้รับเชิญไว้แล้ว' : error.message });
      return false;
    }
    setMessage({ kind: 'success', text: success });
    await load();
    return true;
  };

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (members.some((m) => m.email.toLowerCase() === email)) {
      setMessage({ kind: 'error', text: `${email} เป็นสมาชิกอยู่แล้ว` });
      return;
    }
    const { data } = await supabase.auth.getUser();
    const ok = await run(
      () => supabase.from('invitations').insert({ organization_id: organization.id, email, role: inviteRole, invited_by: data.user?.id }),
      `เชิญ ${email} แล้ว ส่งลิงก์ด้านล่างให้ผู้ถูกเชิญ แล้วให้เข้าสู่ระบบด้วยอีเมลนี้`
    );
    if (ok) setInviteEmail('');
  };

  const cancelInvitation = (inv: Invitation) => {
    if (!window.confirm(`ยกเลิกคำเชิญของ ${inv.email} หรือไม่?`)) return;
    run(() => supabase.from('invitations').delete().eq('id', inv.id), `ยกเลิกคำเชิญของ ${inv.email} แล้ว`);
  };

  const changeRole = (member: Member, role: OrgRole) => {
    run(
      () => supabase.from('organization_members').update({ role }).eq('organization_id', organization.id).eq('user_id', member.user_id),
      `เปลี่ยน ${member.email} เป็น ${ROLE_LABELS[role]} แล้ว`
    ).then((ok) => {
      // ถ้าเปลี่ยนบทบาทของตัวเอง สิทธิ์ทั้งแอปต้องเปลี่ยนตาม
      if (ok && member.email === account.email) account.onMembershipsChanged();
    });
  };

  const removeMember = (member: Member) => {
    const isSelf = member.email === account.email;
    const question = isSelf
      ? `ออกจาก ${organization.name} หรือไม่? จะไม่เห็นข้อมูลของบริษัทนี้อีกจนกว่าจะได้รับเชิญใหม่`
      : `นำ ${member.email} ออกจาก ${organization.name} หรือไม่?`;
    if (!window.confirm(question)) return;
    run(
      () => supabase.from('organization_members').delete().eq('organization_id', organization.id).eq('user_id', member.user_id),
      isSelf ? 'ออกจากบริษัทแล้ว' : `นำ ${member.email} ออกแล้ว`
    ).then((ok) => {
      if (ok && isSelf) account.onMembershipsChanged();
    });
  };

  const copyLoginUrl = async () => {
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopied(true);
    } catch {
      window.prompt('คัดลอกลิงก์นี้', loginUrl);
    }
  };

  // จัดการแถวนี้ได้ไหม: Admin จัดการคนอื่นได้ ยกเว้น Owner ซึ่งต้องเป็น Owner ด้วยกัน
  const canManage = (member: Member) => isAdmin && (member.role !== 'owner' || isOwner);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>สมาชิก</h1>
          <p className="page-subtitle">
            {organization.name} · บทบาทของคุณ: {ROLE_LABELS[organization.role]} ({ROLE_HINTS[organization.role]})
          </p>
        </div>
      </div>

      {message && (
        <p className={`auth-message ${message.kind === 'error' ? 'auth-error' : 'auth-success'}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      {isAdmin && (
        <section className="card settings-card">
          <h2>เชิญสมาชิกใหม่</h2>
          <form className="invite-form" onSubmit={invite}>
            <input
              type="email"
              required
              placeholder="อีเมลของผู้ที่จะเชิญ"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              aria-label="อีเมล"
            />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrgRole)} aria-label="บทบาท">
              {assignableRoles.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]} — {ROLE_HINTS[r]}</option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">เชิญ</button>
          </form>
          <p className="muted invite-hint">
            ระบบยังไม่ส่งอีเมลเชิญให้อัตโนมัติ ส่งลิงก์นี้ให้ผู้ถูกเชิญ แล้วให้เข้าสู่ระบบด้วยอีเมลที่เชิญไว้:{' '}
            <code>{loginUrl}</code>{' '}
            <button type="button" className="link-button" onClick={copyLoginUrl}>{copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}</button>
          </p>

          {invitations.length > 0 && (
            <table className="members-table">
              <thead>
                <tr><th>รอตอบรับ</th><th>บทบาท</th><th>เชิญเมื่อ</th><th></th></tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.email}</td>
                    <td>{ROLE_LABELS[inv.role]}</td>
                    <td>{formatDate(inv.created_at)}</td>
                    <td className="cell-actions">
                      {(inv.role !== 'owner' || isOwner) && (
                        <button className="link-button" onClick={() => cancelInvitation(inv)}>ยกเลิก</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="card settings-card">
        <h2>สมาชิกทั้งหมด ({members.length})</h2>
        {isLoading ? (
          <p className="empty-state">กำลังโหลด...</p>
        ) : (
          <table className="members-table">
            <thead>
              <tr><th>อีเมล</th><th>บทบาท</th><th>เข้าร่วมเมื่อ</th><th></th></tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.email === account.email;
                return (
                  <tr key={m.user_id}>
                    <td>{m.email}{isSelf && <span className="muted"> (คุณ)</span>}</td>
                    <td>
                      {canManage(m) ? (
                        <select value={m.role} onChange={(e) => changeRole(m, e.target.value as OrgRole)} aria-label={`บทบาทของ ${m.email}`}>
                          {assignableRoles.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      ) : (
                        ROLE_LABELS[m.role]
                      )}
                    </td>
                    <td>{formatDate(m.created_at)}</td>
                    <td className="cell-actions">
                      {(isSelf || canManage(m)) && (
                        <button className="link-button link-danger" onClick={() => removeMember(m)}>
                          {isSelf ? 'ออกจากบริษัท' : 'นำออก'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
