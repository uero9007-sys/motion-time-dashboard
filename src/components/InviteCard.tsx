// การ์ด "เชิญเข้าร่วมทีม" ในหน้าตั้งค่า: QR Code + รหัสเชิญ + รายชื่อสมาชิก
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { ROLE_LABELS, type Membership, type OrgRole } from '../lib/auth';
import { formatInviteCode, inviteUrl, rpcErrorMessage } from '../lib/invite';

type Member = { user_id: string; email: string; role: OrgRole; created_at: string };

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; code: string; qr: string; members: Member[] };

// QR สร้างในเครื่อง (ไลบรารี qrcode) ไม่ส่งรหัสไปเว็บสร้าง QR ภายนอก เพราะรหัสจะรั่วไปยังบุคคลที่สาม
// ระดับแก้ข้อผิดพลาด Q (~25%) ให้สแกนได้แม้กระดาษที่พิมพ์ติดหน้างานเปื้อนหรือยับบางส่วน
const renderQr = (code: string) =>
  QRCode.toDataURL(inviteUrl(code), { errorCorrectionLevel: 'Q', margin: 2, width: 720, color: { dark: '#2E2925', light: '#FFFFFF' } });

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

export default function InviteCard({ organization }: { organization: Membership }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [notice, setNotice] = useState('');
  const isOwner = organization.role === 'owner';

  const load = useCallback(async () => {
    const [org, members] = await Promise.all([
      supabase.from('organizations').select('invite_code').eq('id', organization.id).single(),
      supabase.rpc('list_organization_members', { org: organization.id }),
    ]);
    if (org.error || !org.data?.invite_code) {
      setState({ kind: 'error', message: rpcErrorMessage(org.error?.message ?? 'invite_code') });
      return;
    }
    const code = org.data.invite_code as string;
    setState({ kind: 'ready', code, qr: await renderQr(code), members: (members.data ?? []) as Member[] });
  }, [organization.id]);

  useEffect(() => {
    // setState ใน load เกิดหลัง await เท่านั้น
    // oxlint-disable-next-line react/set-state-in-effect
    load();
  }, [load]);

  // กด Esc ปิด Modal ยืนยัน (ยกเว้นระหว่างกำลังสร้างรหัส)
  useEffect(() => {
    if (!confirmRotate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !rotating) setConfirmRotate(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmRotate, rotating]);

  const copy = async (text: string, what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt('คัดลอกข้อความนี้', text);
    }
  };

  const rotate = async () => {
    setRotating(true);
    const { data, error } = await supabase.rpc('rotate_invite_code', { p_org: organization.id });
    setRotating(false);
    setConfirmRotate(false);
    if (error) {
      setNotice(rpcErrorMessage(error.message));
      return;
    }
    const code = data as string;
    setState((prev) => (prev.kind === 'ready' ? { ...prev, code } : prev));
    const qr = await renderQr(code);
    setState((prev) => (prev.kind === 'ready' ? { ...prev, code, qr } : prev));
    setNotice('สร้างรหัสใหม่แล้ว รหัสและ QR เดิมใช้ไม่ได้อีก ถ้าพิมพ์ติดไว้ต้องพิมพ์ใหม่');
  };

  return (
    <section className="card settings-card invite-card">
      <h2>เชิญเข้าร่วมทีม</h2>
      <p className="invite-intro">
        ให้เพื่อนร่วมงานเปิดแอป MTS แล้วสแกน QR นี้ หรือกรอกรหัส เพื่อเข้าร่วม <strong>{organization.name}</strong> ในฐานะ Member
      </p>

      {state.kind === 'loading' && <p className="invite-intro">กำลังโหลด...</p>}
      {state.kind === 'error' && <p className="auth-message auth-error">{state.message}</p>}

      {state.kind === 'ready' && (
        <>
          <div className="invite-body">
            <img className="invite-qr" src={state.qr} alt={`QR Code สำหรับเข้าร่วม ${organization.name}`} width={240} height={240} />
            <div className="invite-details">
              <span className="invite-label">รหัสเชิญ</span>
              <code className="invite-code">{formatInviteCode(state.code)}</code>
              <div className="invite-actions">
                <button type="button" className="btn" onClick={() => copy(formatInviteCode(state.code), 'code')}>
                  {copied === 'code' ? 'คัดลอกแล้ว' : 'คัดลอกรหัส'}
                </button>
                <button type="button" className="btn" onClick={() => copy(inviteUrl(state.code), 'link')}>
                  {copied === 'link' ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
                </button>
                <a className="btn" href={state.qr} download={`MTS-invite-${state.code}.png`}>
                  ดาวน์โหลด QR (PNG)
                </a>
              </div>
              {isOwner ? (
                <button type="button" className="link-button link-danger" onClick={() => setConfirmRotate(true)}>
                  สร้างรหัสใหม่ (รหัสเดิมจะใช้ไม่ได้)
                </button>
              ) : (
                <span className="invite-hint">เฉพาะ Owner เท่านั้นที่สร้างรหัสใหม่ได้</span>
              )}
            </div>
          </div>

          {notice && <p className="auth-message auth-success" role="status">{notice}</p>}

          <h3 className="invite-members-title">สมาชิก ({state.members.length})</h3>
          <div className="table-wrap">
            <table className="members-table">
              <thead>
                <tr>
                  <th>อีเมล</th>
                  <th>บทบาท</th>
                  <th>เข้าร่วมเมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {state.members.map((m) => (
                  <tr key={m.user_id}>
                    <td>{m.email}</td>
                    <td>{ROLE_LABELS[m.role]}</td>
                    <td>{formatDate(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirmRotate && (
        <div className="modal-backdrop" role="presentation" onClick={() => !rotating && setConfirmRotate(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rotate-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="rotate-title">สร้างรหัสเชิญใหม่?</h3>
            <p>รหัสและ QR เดิมจะใช้ไม่ได้ทันที รวมถึง QR ที่พิมพ์ติดไว้ คนที่เข้าร่วมแล้วยังอยู่ในทีมเหมือนเดิม</p>
            <div className="auth-actions">
              <button type="button" className="btn btn-primary" onClick={rotate} disabled={rotating}>
                {rotating ? 'กำลังสร้าง...' : 'สร้างรหัสใหม่'}
              </button>
              <button type="button" className="btn" onClick={() => setConfirmRotate(false)} disabled={rotating}>
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
