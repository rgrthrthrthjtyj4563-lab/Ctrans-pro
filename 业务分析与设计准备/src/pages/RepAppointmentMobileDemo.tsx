import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeft,
  Bell,
  Building2,
  Calendar,
  Check,
  Clock,
  Home,
  MessageSquare,
  Plus,
  Share2,
  SlidersHorizontal,
  User,
} from 'lucide-react';
import {
  agreeAppointment,
  createDefaultSession,
  clearDemoSession,
  createSubmittedAppointment,
  currentStepIndex,
  DEMO_REP_NAME,
  DEPARTMENT_OPTIONS,
  emptyForm,
  FLOW_STEPS,
  formatDateCn,
  formatDateTime,
  hasFormErrors,
  HOSPITAL_OPTIONS,
  jumpToStatus,
  listStatusLabel,
  loadDemoSession,
  mainActionFor,
  markInviteSent,
  markSynced,
  revokeAppointment,
  saveDemoSession,
  saveDraftEdits,
  selectedAppointment,
  STATUS_STYLE,
  submitDraft,
  todayISO,
  validateForm,
  wait,
  type DemoAppointment,
  type DemoAppointmentStatus,
  type DemoDisplayStatus,
  type DemoFormErrors,
  type DemoFormInput,
  type DemoSession,
  type DemoTab,
} from '../domain/repAppointmentDemo';

const SHARE_MS = 650;
const AGREE_MS = 560;
const SYNC_MS = 820;
const SCENE_MS = 200;

type Busy = 'share' | 'agree' | 'sync' | null;
type Notice = { tone: 'success' | 'info' | 'warning'; text: string } | null;

interface Props {
  onExit: () => void;
  reducedMotion?: boolean;
}

export function RepAppointmentMobileDemo({ onExit, reducedMotion = false }: Props) {
  const [session, setSession] = useState<DemoSession>(() => loadDemoSession());
  const [form, setForm] = useState<DemoFormInput>(emptyForm);
  const [errors, setErrors] = useState<DemoFormErrors>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [controlOpen, setControlOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entered, setEntered] = useState(reducedMotion);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => {
      alive.current = false;
      cancelAnimationFrame(id);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  useEffect(() => {
    saveDemoSession(session);
  }, [session]);

  const appointment = selectedAppointment(session);
  const displayStatus: DemoDisplayStatus = busy === 'sync' && appointment?.status === '医院已同意'
    ? '同步中'
    : (appointment?.status ?? '草稿');

  const update = useCallback((recipe: (prev: DemoSession) => DemoSession) => {
    setSession(prev => recipe(prev));
  }, []);

  const showNotice = useCallback((tone: NonNullable<Notice>['tone'], text: string) => {
    setNotice({ tone, text });
  }, []);

  function goHome() {
    setEditingId(null);
    update(prev => ({ ...prev, view: 'home', tab: '预约' }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setErrors({});
    update(prev => ({ ...prev, view: 'create', tab: '预约', selectedId: prev.selectedId }));
  }

  function openEditDraft() {
    if (!appointment || appointment.status !== '草稿') return;
    setEditingId(appointment.id);
    setForm({
      hospital: appointment.hospital,
      department: appointment.department,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      subject: appointment.subject,
      remark: appointment.remark ?? '',
    });
    setErrors({});
    update(prev => ({ ...prev, view: 'create', tab: '预约', selectedId: appointment.id }));
  }

  function openDetail(id: string) {
    update(prev => ({ ...prev, selectedId: id, view: 'detail', tab: '预约' }));
  }

  function openHospital() {
    if (!appointment) return;
    update(prev => ({ ...prev, view: 'hospital', selectedId: appointment.id, tab: '预约' }));
  }

  async function handleSubmitForm() {
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (hasFormErrors(nextErrors)) return;
    if (editingId) {
      const id = editingId;
      update(prev => submitDraft(saveDraftEdits(prev, id, form), id));
      setEditingId(null);
    } else {
      update(prev => createSubmittedAppointment(prev, form));
    }
    showNotice('success', '预约信息已保存，可以发送给医院确认。');
  }

  async function handleSubmitDraft() {
    if (!appointment || busy) return;
    update(prev => submitDraft(prev, appointment.id));
    showNotice('success', '预约信息已保存，可以发送给医院确认。');
  }

  async function handleShare() {
    if (!appointment || busy) return;
    setBusy('share');
    await wait(SHARE_MS);
    if (!alive.current) return;
    update(prev => markInviteSent(prev, appointment.id));
    setBusy(null);
    showNotice('info', '预约邀请已生成，等待医院确认。');
  }

  async function handleAgree() {
    if (!appointment || busy) return;
    setBusy('agree');
    await wait(AGREE_MS);
    if (!alive.current) return;
    update(prev => agreeAppointment(prev, appointment.id));
    setBusy(null);
    showNotice('success', '医院已同意预约。');
  }

  function handleDecline() {
    showNotice('warning', '本次演示未进入拒绝流程，预约仍等待确认。');
  }

  async function handleSync() {
    if (!appointment || busy) return;
    setBusy('sync');
    await wait(SYNC_MS);
    if (!alive.current) return;
    update(prev => markSynced(prev, appointment.id));
    setBusy(null);
    showNotice('success', '预约已同步到医药代表移动端。');
  }

  function handleRevoke() {
    if (!appointment || busy) return;
    update(prev => revokeAppointment(prev, appointment.id));
    showNotice('info', '预约已撤销。');
  }

  function handleMainAction() {
    if (!appointment) return;
    const action = mainActionFor(appointment, {
      syncing: busy === 'sync',
      sharing: busy === 'share',
      agreeing: busy === 'agree',
      showInviteCard: session.showInviteCard,
    });
    if (action.disabled) return;
    if (action.kind === 'submit') handleSubmitDraft();
    if (action.kind === 'share') handleShare();
    if (action.kind === 'sync') handleSync();
    if (action.kind === 'home') goHome();
    if (action.kind === 'restart') openCreate();
  }

  function handleJump(target: '待医院确认' | '医院已同意' | '已同步') {
    const id = appointment?.id;
    if (!id) return;
    update(prev => jumpToStatus(prev, id, target));
    setBusy(null);
    setControlOpen(false);
    showNotice('info', `当前状态：${target}`);
  }

  function handleReset() {
    const next = createDefaultSession();
    clearDemoSession();
    saveDemoSession(next);
    setSession(next);
    setForm(emptyForm());
    setErrors({});
    setBusy(null);
    setNotice(null);
    setResetOpen(false);
    setControlOpen(false);
    setEditingId(null);
    showNotice('info', '演示已恢复为初始状态。');
  }

  const anim = reducedMotion ? 'none' : `demoSceneIn ${SCENE_MS}ms ease`;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      background: '#E8EEEC',
      opacity: entered ? 1 : 0,
      transition: reducedMotion ? 'none' : `opacity ${SCENE_MS}ms ease`,
    }}>
      <header style={{
        height: 52,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E5E7EB',
        zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#176B5B',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, color: '#667085' }}>演示场景：</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>医药代表移动端</span>
        </div>
        <button
          type="button"
          onClick={onExit}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minHeight: 36,
            padding: '0 12px',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'inherit',
            color: '#176B5B',
            background: '#E8F4F1',
            border: '1px solid #B7E0D4',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} /> 返回后台
        </button>
      </header>

      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        overflow: 'auto',
      }}>
        <div
          className="demo-scene-enter"
          style={{
            width: 390,
            height: 760,
            maxHeight: '100%',
            background: '#0B1220',
            borderRadius: 36,
            padding: 10,
            boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
            animation: anim,
            flexShrink: 0,
          }}
        >
          <div style={{
            height: '100%',
            background: '#F5F7F8',
            borderRadius: 28,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}>
            <PhoneStatusBar />

            <div style={{
              position: 'absolute',
              top: 36,
              right: 10,
              zIndex: 30,
            }}>
              <DemoControl
                open={controlOpen}
                status={displayStatus}
                onToggle={() => setControlOpen(v => !v)}
                onJump={handleJump}
                onReset={() => { setControlOpen(false); setResetOpen(true); }}
              />
            </div>

            {notice && (
              <NoticeBanner notice={notice} onClose={() => setNotice(null)} />
            )}

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {session.tab !== '预约' ? (
                <PlaceholderTab tab={session.tab} />
              ) : session.view === 'create' ? (
                <CreateView
                  form={form}
                  errors={errors}
                  onChange={(key, value) => {
                    setForm(prev => ({ ...prev, [key]: value }));
                    setErrors(prev => ({ ...prev, [key]: undefined }));
                  }}
                  onBack={goHome}
                  onSubmit={handleSubmitForm}
                />
              ) : session.view === 'hospital' && appointment ? (
                <HospitalView
                  appointment={appointment}
                  displayStatus={displayStatus}
                  busy={busy}
                  onBack={() => openDetail(appointment.id)}
                  onAgree={handleAgree}
                  onDecline={handleDecline}
                  onSync={handleSync}
                  onHome={goHome}
                />
              ) : session.view === 'detail' && appointment ? (
                <DetailView
                  appointment={appointment}
                  displayStatus={displayStatus}
                  showInviteCard={session.showInviteCard}
                  busy={busy}
                  onBack={goHome}
                  onMain={handleMainAction}
                  onHospital={openHospital}
                  onRevoke={handleRevoke}
                  onReshare={handleShare}
                  onEdit={openEditDraft}
                />
              ) : (
                <HomeView
                  appointments={session.appointments}
                  onCreate={openCreate}
                  onOpen={openDetail}
                />
              )}
            </div>

            {session.view === 'home' && (
              <BottomNav
                tab={session.tab}
                onChange={tab => update(prev => ({ ...prev, tab, view: 'home' }))}
              />
            )}
          </div>
        </div>
      </div>

      {resetOpen && (
        <ResetConfirm
          onCancel={() => setResetOpen(false)}
          onConfirm={handleReset}
        />
      )}
    </div>
  );
}

function PhoneStatusBar() {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return (
    <div style={{
      height: 34,
      padding: '8px 18px 0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: 12,
      fontWeight: 600,
      color: '#1F2937',
      flexShrink: 0,
    }}>
      <span>{time}</span>
      <span style={{
        width: 108,
        height: 18,
        borderRadius: 12,
        background: '#111827',
      }} />
      <span style={{ fontSize: 11, color: '#6B7280', letterSpacing: 1 }}>LTE</span>
    </div>
  );
}

function NoticeBanner({ notice, onClose }: { notice: NonNullable<Notice>; onClose: () => void }) {
  const tone = {
    success: { bg: '#E6F5ED', fg: '#248A5A', border: '#BBF7D0' },
    info: { bg: '#EBF2FE', fg: '#2F6BCE', border: '#BFDBFE' },
    warning: { bg: '#FEF3E2', fg: '#C77A16', border: '#FDE68A' },
  }[notice.tone];
  return (
    <div style={{
      margin: '6px 12px 0',
      padding: '10px 12px',
      borderRadius: 8,
      background: tone.bg,
      color: tone.fg,
      border: `1px solid ${tone.border}`,
      fontSize: 13,
      lineHeight: 1.45,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      flexShrink: 0,
    }}>
      <span style={{ flex: 1 }}>{notice.text}</span>
      <button
        type="button"
        onClick={onClose}
        style={{
          border: 'none',
          background: 'none',
          color: tone.fg,
          cursor: 'pointer',
          padding: 0,
          fontSize: 12,
          fontFamily: 'inherit',
        }}
      >
        关闭
      </button>
    </div>
  );
}

function HomeView({
  appointments,
  onCreate,
  onOpen,
}: {
  appointments: DemoAppointment[];
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div style={{ padding: '8px 16px 20px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1F2937', marginBottom: 4, paddingRight: 72 }}>我的预约</div>
      <div style={{ fontSize: 14, color: '#374151', marginBottom: 2 }}>你好，{DEMO_REP_NAME}</div>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>{formatDateCn(todayISO())}</div>

      <TouchButton variant="primary" onClick={onCreate} icon={<Plus size={16} />}>
        新建医院预约
      </TouchButton>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {appointments.map(item => (
          <AppointmentCard key={item.id} appointment={item} onOpen={() => onOpen(item.id)} />
        ))}
      </div>
    </div>
  );
}

function AppointmentCard({ appointment, onOpen }: { appointment: DemoAppointment; onOpen: () => void }) {
  const label = listStatusLabel(appointment.status);
  const confirmed = appointment.status === '已同步';
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: 14,
        cursor: 'pointer',
        minHeight: 88,
        fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1F2937' }}>{appointment.hospital}</div>
        <StatusChip label={label} status={appointment.status} />
      </div>
      <div style={{ fontSize: 13, color: '#667085', marginTop: 8 }}>
        {appointment.department} · {formatDateTime(appointment.appointmentDate, appointment.appointmentTime)}
      </div>
      <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>{appointment.subject}</div>
      {confirmed && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#248A5A' }}>
          医院已同意 · 最近同步 {appointment.syncedAt}
        </div>
      )}
    </button>
  );
}

function CreateView({
  form,
  errors,
  onChange,
  onBack,
  onSubmit,
}: {
  form: DemoFormInput;
  errors: DemoFormErrors;
  onChange: (key: keyof DemoFormInput, value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div style={{ padding: '4px 16px 24px' }}>
      <SubHeader title="新建医院预约" onBack={onBack} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
        <Field label="医院" required error={errors.hospital}>
          <select
            value={form.hospital}
            onChange={e => onChange('hospital', e.target.value)}
            style={fieldControlStyle(Boolean(errors.hospital))}
          >
            <option value="">请选择医院</option>
            {HOSPITAL_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="科室" required error={errors.department}>
          <select
            value={form.department}
            onChange={e => onChange('department', e.target.value)}
            style={fieldControlStyle(Boolean(errors.department))}
          >
            <option value="">请选择科室</option>
            {DEPARTMENT_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="预约日期" required error={errors.appointmentDate}>
          <input
            type="date"
            value={form.appointmentDate}
            onChange={e => onChange('appointmentDate', e.target.value)}
            style={fieldControlStyle(Boolean(errors.appointmentDate))}
          />
        </Field>
        <Field label="预计到院时间" required error={errors.appointmentTime}>
          <input
            type="time"
            value={form.appointmentTime}
            onChange={e => onChange('appointmentTime', e.target.value)}
            style={fieldControlStyle(Boolean(errors.appointmentTime))}
          />
        </Field>
        <Field label="拜访事项" required error={errors.subject}>
          <input
            value={form.subject}
            onChange={e => onChange('subject', e.target.value)}
            placeholder="例如：品种信息沟通"
            style={fieldControlStyle(Boolean(errors.subject))}
          />
        </Field>
        <Field label="备注">
          <textarea
            value={form.remark ?? ''}
            onChange={e => onChange('remark', e.target.value)}
            placeholder="选填，如入院注意事项"
            rows={3}
            style={{
              ...fieldControlStyle(false),
              height: 'auto',
              minHeight: 88,
              padding: '10px 12px',
              resize: 'none',
            }}
          />
        </Field>
        <TouchButton variant="primary" onClick={onSubmit}>提交预约</TouchButton>
      </div>
    </div>
  );
}

function DetailView({
  appointment,
  displayStatus,
  showInviteCard,
  busy,
  onBack,
  onMain,
  onHospital,
  onRevoke,
  onReshare,
  onEdit,
}: {
  appointment: DemoAppointment;
  displayStatus: DemoDisplayStatus;
  showInviteCard: boolean;
  busy: Busy;
  onBack: () => void;
  onMain: () => void;
  onHospital: () => void;
  onRevoke: () => void;
  onReshare: () => void;
  onEdit: () => void;
}) {
  const action = mainActionFor(appointment, {
    syncing: busy === 'sync',
    sharing: busy === 'share',
    agreeing: busy === 'agree',
    showInviteCard,
  });
  const canRevoke = appointment.status === '待医院确认'
    || appointment.status === '医院已同意'
    || appointment.status === '已同步';
  const inviteVisible = Boolean(appointment.sharedAt) || showInviteCard;

  return (
    <div style={{ padding: '4px 16px 24px' }}>
      <SubHeader title="预约详情" onBack={onBack} extra={<StatusChip label={STATUS_STYLE[displayStatus].label} status={displayStatus} />} />

      <section style={cardStyle}>
        <InfoRow icon={<Building2 size={14} />} label="医院" value={appointment.hospital} />
        <InfoRow icon={<User size={14} />} label="科室" value={appointment.department} />
        <InfoRow icon={<Calendar size={14} />} label="预约时间" value={formatDateTime(appointment.appointmentDate, appointment.appointmentTime)} />
        <InfoRow icon={<MessageSquare size={14} />} label="拜访事项" value={appointment.subject} />
        {appointment.remark && <InfoRow icon={<Clock size={14} />} label="备注" value={appointment.remark} />}
      </section>

      <section style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2937', marginBottom: 12 }}>当前进度</div>
        <VerticalSteps status={displayStatus} />
      </section>

      {inviteVisible && appointment.status !== '草稿' && appointment.status !== '已撤销' && (
        <InviteCard appointment={appointment} onHospital={onHospital} />
      )}

      <div style={{ marginTop: 16 }}>
        <TouchButton
          variant="primary"
          disabled={action.disabled || Boolean(busy)}
          loading={busy === 'share' || busy === 'sync'}
          onClick={onMain}
        >
          {action.label}
        </TouchButton>
      </div>

      {appointment.status === '草稿' && (
        <div style={{ marginTop: 8 }}>
          <TouchButton variant="secondary" disabled={Boolean(busy)} onClick={onEdit}>
            继续编辑
          </TouchButton>
        </div>
      )}

      {appointment.status === '待医院确认' && appointment.sharedAt && !busy && (
        <button
          type="button"
          onClick={onReshare}
          style={{
            marginTop: 8,
            width: '100%',
            minHeight: 44,
            border: 'none',
            background: 'none',
            color: '#176B5B',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          重新发送
        </button>
      )}

      {canRevoke && (
        <button
          type="button"
          onClick={onRevoke}
          disabled={Boolean(busy)}
          style={{
            marginTop: 4,
            width: '100%',
            minHeight: 44,
            border: 'none',
            background: 'none',
            color: '#9CA3AF',
            fontSize: 13,
            cursor: busy ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          撤销预约
        </button>
      )}

      <section style={{ ...cardStyle, marginTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2937', marginBottom: 10 }}>操作记录</div>
        {[...appointment.logs].slice().reverse().map((item, index, list) => (
          <div key={item.id} style={{ display: 'flex', gap: 10, paddingBottom: index === list.length - 1 ? 0 : 12 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: index === 0 ? '#176B5B' : '#D1D5DB',
              marginTop: 5,
              flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: 13, color: '#1F2937' }}>{item.title}</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{item.time}{item.detail ? ` · ${item.detail}` : ''}</div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function HospitalView({
  appointment,
  displayStatus,
  busy,
  onBack,
  onAgree,
  onDecline,
  onSync,
  onHome,
}: {
  appointment: DemoAppointment;
  displayStatus: DemoDisplayStatus;
  busy: Busy;
  onBack: () => void;
  onAgree: () => void;
  onDecline: () => void;
  onSync: () => void;
  onHome: () => void;
}) {
  const waiting = appointment.status === '待医院确认';
  const agreed = appointment.status === '医院已同意' || displayStatus === '同步中';
  const synced = appointment.status === '已同步';

  return (
    <div style={{ padding: '4px 16px 24px' }}>
      <SubHeader title="医院确认" onBack={onBack} extra={<StatusChip label={STATUS_STYLE[displayStatus].label} status={displayStatus} />} />

      <div style={{
        ...cardStyle,
        textAlign: 'center',
        padding: 20,
      }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: '#E8F4F1',
          color: '#176B5B',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
        }}>
          <Building2 size={22} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1F2937' }}>{appointment.hospital}</div>
        <div style={{ fontSize: 13, color: '#667085', marginTop: 6 }}>医药代表 {appointment.representativeName}</div>
      </div>

      <section style={{ ...cardStyle, marginTop: 12 }}>
        <InfoRow icon={<Calendar size={14} />} label="预约时间" value={formatDateTime(appointment.appointmentDate, appointment.appointmentTime)} />
        <InfoRow icon={<User size={14} />} label="科室" value={appointment.department} />
        <InfoRow icon={<MessageSquare size={14} />} label="拜访事项" value={appointment.subject} />
      </section>

      <div style={{
        marginTop: 12,
        padding: '10px 12px',
        borderRadius: 8,
        background: '#EBF2FE',
        color: '#2F6BCE',
        fontSize: 13,
        lineHeight: 1.5,
      }}>
        确认后，预约结果将同步给医药代表。
      </div>

      {synced && (
        <div style={{
          marginTop: 12,
          padding: '10px 12px',
          borderRadius: 8,
          background: '#E6F5ED',
          color: '#248A5A',
          fontSize: 13,
        }}>
          预约已同步到医药代表移动端。
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {waiting && (
          <>
            <TouchButton variant="primary" disabled={Boolean(busy)} loading={busy === 'agree'} onClick={onAgree}>
              {busy === 'agree' ? '正在确认…' : '同意预约'}
            </TouchButton>
            <TouchButton variant="secondary" disabled={Boolean(busy)} onClick={onDecline}>
              暂不同意
            </TouchButton>
          </>
        )}
        {agreed && !synced && (
          <TouchButton variant="primary" disabled={Boolean(busy)} loading={busy === 'sync'} onClick={onSync}>
            {busy === 'sync' ? '正在同步预约…' : '同步到医药代表移动端'}
          </TouchButton>
        )}
        {synced && (
          <TouchButton variant="primary" onClick={onHome}>返回我的预约</TouchButton>
        )}
      </div>
    </div>
  );
}

function InviteCard({ appointment, onHospital }: { appointment: DemoAppointment; onHospital: () => void }) {
  return (
    <section style={{
      marginTop: 12,
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid #E5E7EB',
      background: '#FFFFFF',
    }}>
      <div style={{
        padding: '10px 14px',
        background: '#176B5B',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        fontWeight: 600,
      }}>
        <Share2 size={14} /> 预约邀请
        <span style={{
          marginLeft: 'auto',
          fontSize: 11,
          fontWeight: 500,
          background: 'rgba(255,255,255,0.16)',
          borderRadius: 999,
          padding: '2px 8px',
        }}>
          小程序
        </span>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1F2937' }}>{appointment.hospital}</div>
        <div style={{ fontSize: 13, color: '#667085', marginTop: 8, lineHeight: 1.7 }}>
          <div>科室：{appointment.department}</div>
          <div>日期：{appointment.appointmentDate}</div>
          <div>时间：{appointment.appointmentTime}</div>
          <div>拜访事项：{appointment.subject}</div>
        </div>
        <TouchButton variant="secondary" onClick={onHospital} style={{ marginTop: 12 }}>
          切换到医院确认页
        </TouchButton>
      </div>
    </section>
  );
}

function VerticalSteps({ status }: { status: DemoDisplayStatus }) {
  const current = currentStepIndex(status);
  const revoked = status === '已撤销';
  return (
    <div>
      {FLOW_STEPS.map((label, index) => {
        const done = !revoked && current > index;
        const active = !revoked && current === index;
        return (
          <div key={label} style={{ display: 'flex', gap: 10, minHeight: index === FLOW_STEPS.length - 1 ? 24 : 44 }}>
            <div style={{ width: 18, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: done || active ? '#176B5B' : '#E5E7EB',
                color: done || active ? '#fff' : '#9CA3AF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {done ? <Check size={11} /> : <span style={{ fontSize: 10, fontWeight: 700 }}>{index + 1}</span>}
              </span>
              {index < FLOW_STEPS.length - 1 && (
                <span style={{
                  width: 2,
                  flex: 1,
                  background: done ? '#176B5B' : '#E5E7EB',
                  margin: '4px 0',
                }} />
              )}
            </div>
            <div style={{
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: revoked ? '#9CA3AF' : active ? '#176B5B' : done ? '#374151' : '#9CA3AF',
              paddingTop: 1,
            }}>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BottomNav({ tab, onChange }: { tab: DemoTab; onChange: (tab: DemoTab) => void }) {
  const items: { id: DemoTab; label: string; icon: typeof Home }[] = [
    { id: '预约', label: '预约', icon: Home },
    { id: '消息', label: '消息', icon: Bell },
    { id: '我的', label: '我的', icon: User },
  ];
  return (
    <nav style={{
      height: 58,
      borderTop: '1px solid #E5E7EB',
      background: '#FFFFFF',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      flexShrink: 0,
    }}>
      {items.map(item => {
        const active = tab === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={{
              border: 'none',
              background: 'none',
              minHeight: 44,
              color: active ? '#176B5B' : '#9CA3AF',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Icon size={18} />
            <span style={{ fontSize: 11, fontWeight: active ? 600 : 400 }}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function PlaceholderTab({ tab }: { tab: DemoTab }) {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#9CA3AF',
      gap: 8,
      padding: 24,
      textAlign: 'center',
    }}>
      {tab === '消息' ? <Bell size={28} /> : <User size={28} />}
      <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>{tab === '消息' ? '暂无新消息' : '杨明'}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
        {tab === '消息' ? '预约确认结果会显示在「我的预约」中。' : '东方恒业推广有限公司 · 医药代表'}
      </div>
    </div>
  );
}

function DemoControl({
  open,
  status,
  onToggle,
  onJump,
  onReset,
}: {
  open: boolean;
  status: DemoDisplayStatus;
  onToggle: () => void;
  onJump: (target: '待医院确认' | '医院已同意' | '已同步') => void;
  onReset: () => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggle}
        title="演示控制"
        style={{
          minHeight: 32,
          padding: '0 10px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          borderRadius: 6,
          border: '1px solid #E5E7EB',
          background: '#F9FAFB',
          color: '#6B7280',
          fontSize: 12,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <SlidersHorizontal size={12} /> 演示
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 6,
          width: 200,
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          padding: 8,
          zIndex: 20,
        }}>
          <div style={{ fontSize: 11, color: '#9CA3AF', padding: '4px 8px 8px' }}>
            当前状态：{status}
          </div>
          {([
            ['待医院确认', '跳到待医院确认'],
            ['医院已同意', '跳到医院已同意'],
            ['已同步', '跳到已同步'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onJump(value)}
              style={controlItemStyle}
            >
              {label}
            </button>
          ))}
          <div style={{ height: 1, background: '#E5E7EB', margin: '6px 4px' }} />
          <button type="button" onClick={onReset} style={{ ...controlItemStyle, color: '#C73A3A' }}>
            重置本次演示
          </button>
        </div>
      )}
    </div>
  );
}

function ResetConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} onClick={onCancel} />
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 400,
        background: '#FFFFFF',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 16px 40px rgba(0,0,0,0.16)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#1F2937', marginBottom: 8 }}>重置本次演示</div>
        <div style={{ fontSize: 14, color: '#667085', lineHeight: 1.6 }}>
          重置后，本次预约记录将恢复为初始状态。
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <TouchButton variant="secondary" onClick={onCancel} style={{ width: 'auto', padding: '0 16px' }}>取消</TouchButton>
          <TouchButton variant="danger" onClick={onConfirm} style={{ width: 'auto', padding: '0 16px' }}>重置本次演示</TouchButton>
        </div>
      </div>
    </div>
  );
}

function SubHeader({ title, onBack, extra }: { title: string; onBack: () => void; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, marginBottom: 8, paddingRight: 64 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          background: 'none',
          color: '#374151',
          cursor: 'pointer',
          marginLeft: -10,
        }}
      >
        <ArrowLeft size={18} />
      </button>
      <div style={{ flex: 1, fontSize: 16, fontWeight: 600, color: '#1F2937' }}>{title}</div>
      {extra}
    </div>
  );
}

function StatusChip({ label, status }: { label: string; status: DemoDisplayStatus | DemoAppointmentStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '4px 8px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 500,
      background: style.bg,
      color: style.fg,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: style.dot }} />
      {label}
    </span>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: '#C73A3A', marginLeft: 2 }}>*</span>}
      </div>
      {children}
      {error && <div style={{ marginTop: 6, fontSize: 12, color: '#C73A3A' }}>{error}</div>}
    </label>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
      <span style={{ color: '#9CA3AF', marginTop: 2 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 12, color: '#9CA3AF' }}>{label}</div>
        <div style={{ fontSize: 14, color: '#1F2937', marginTop: 2 }}>{value}</div>
      </div>
    </div>
  );
}

function TouchButton({
  variant = 'primary',
  disabled,
  loading,
  onClick,
  children,
  icon,
  style,
}: {
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  style?: CSSProperties;
}) {
  const palette = {
    primary: { bg: '#176B5B', color: '#fff', border: '#176B5B' },
    secondary: { bg: '#FFFFFF', color: '#374151', border: '#D1D5DB' },
    danger: { bg: '#C73A3A', color: '#fff', border: '#C73A3A' },
  }[variant];
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      style={{
        width: '100%',
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '0 16px',
        fontSize: 14,
        fontWeight: 600,
        fontFamily: 'inherit',
        color: palette.color,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 8,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.55 : 1,
        ...style,
      }}
    >
      {loading ? (
        <span style={{
          width: 14,
          height: 14,
          border: `2px solid ${palette.color}40`,
          borderTop: `2px solid ${palette.color}`,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      ) : icon}
      {children}
    </button>
  );
}

function fieldControlStyle(error: boolean): CSSProperties {
  return {
    width: '100%',
    minHeight: 44,
    padding: '0 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    color: '#1F2937',
    background: '#FFFFFF',
    border: `1px solid ${error ? '#C73A3A' : '#E5E7EB'}`,
    borderRadius: 8,
    outline: 'none',
  };
}

const cardStyle: CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderRadius: 12,
  padding: 14,
};

const controlItemStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  minHeight: 36,
  padding: '8px',
  border: 'none',
  background: 'none',
  borderRadius: 6,
  fontSize: 13,
  color: '#374151',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
