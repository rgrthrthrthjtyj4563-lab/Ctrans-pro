/**
 * 医药代表预约移动端演示 — 本地状态模型
 * 仅用于产品演示，不接小程序、微信、短信或后端接口。
 */

export const DEMO_STORAGE_KEY = 'baiyee-rep-appointment-demo';
export const DEMO_REP_NAME = '杨明';
export const SAMPLE_APPOINTMENT_ID = 'demo-apt-001';

/** 长期业务状态。交互过程「同步中」不落库。 */
export type DemoAppointmentStatus = '草稿' | '待医院确认' | '医院已同意' | '已同步' | '已撤销';
export type DemoDisplayStatus = DemoAppointmentStatus | '同步中';
export type DemoView = 'home' | 'create' | 'detail' | 'hospital';
export type DemoTab = '预约' | '消息' | '我的';

export interface DemoLog {
  id: string;
  time: string;
  title: string;
  detail?: string;
}

export interface DemoAppointment {
  id: string;
  representativeName: string;
  hospital: string;
  department: string;
  appointmentDate: string;
  appointmentTime: string;
  subject: string;
  remark?: string;
  status: DemoAppointmentStatus;
  sharedAt?: string;
  agreedAt?: string;
  syncedAt?: string;
  logs: DemoLog[];
}

export interface DemoFormInput {
  hospital: string;
  department: string;
  appointmentDate: string;
  appointmentTime: string;
  subject: string;
  remark?: string;
}

export interface DemoFormErrors {
  hospital?: string;
  department?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  subject?: string;
}

export interface DemoSession {
  appointments: DemoAppointment[];
  selectedId: string | null;
  view: DemoView;
  showInviteCard: boolean;
  tab: DemoTab;
}

export const HOSPITAL_OPTIONS = [
  '华安市人民医院',
  '北京协和医院',
  '上海瑞金医院',
  '杭州市第一人民医院',
];

export const DEPARTMENT_OPTIONS = [
  '心内科',
  '内分泌科',
  '神经内科',
  '消化内科',
  '肿瘤科',
  '呼吸内科',
];

export const FLOW_STEPS = [
  '预约信息已填写',
  '等待医院确认',
  '预约小程序已同意',
  '已同步到移动端',
] as const;

const STATUS_STEP: Record<DemoDisplayStatus, number> = {
  '草稿': 0,
  '待医院确认': 1,
  '医院已同意': 2,
  '同步中': 2,
  '已同步': 3,
  '已撤销': -1,
};

export const STATUS_STYLE: Record<DemoDisplayStatus, { fg: string; bg: string; dot: string; label: string }> = {
  '草稿': { fg: '#374151', bg: '#F3F4F6', dot: '#9CA3AF', label: '草稿' },
  '待医院确认': { fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16', label: '待医院确认' },
  '医院已同意': { fg: '#0F766E', bg: '#E8F4F1', dot: '#176B5B', label: '医院已同意' },
  '同步中': { fg: '#2F6BCE', bg: '#EBF2FE', dot: '#2F6BCE', label: '同步中' },
  '已同步': { fg: '#248A5A', bg: '#E6F5ED', dot: '#248A5A', label: '已同步' },
  '已撤销': { fg: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF', label: '已撤销' },
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function nowStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateCn(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const week = ['日', '一', '二', '三', '四', '五', '六'][new Date(y, m - 1, d).getDay()];
  return `${y}年${m}月${d}日 星期${week}`;
}

export function formatDateTime(date: string, time: string): string {
  return `${date} ${time}`;
}

export function nextId(prefix = 'demo-apt'): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function log(title: string, detail?: string): DemoLog {
  return { id: nextId('log'), time: nowStamp(), title, detail };
}

export function sampleAppointment(): DemoAppointment {
  return {
    id: SAMPLE_APPOINTMENT_ID,
    representativeName: DEMO_REP_NAME,
    hospital: '华安市人民医院',
    department: '心内科',
    appointmentDate: '2026-08-28',
    appointmentTime: '09:30',
    subject: '品种信息沟通',
    remark: '首次拜访，请协助确认入院流程',
    status: '草稿',
    logs: [log('已填写预约信息', '华安市人民医院 · 心内科')],
  };
}

export function emptyForm(): DemoFormInput {
  return {
    hospital: '华安市人民医院',
    department: '心内科',
    appointmentDate: '2026-08-28',
    appointmentTime: '09:30',
    subject: '品种信息沟通',
    remark: '首次拜访，请协助确认入院流程',
  };
}

export function createDefaultSession(): DemoSession {
  const sample = sampleAppointment();
  return {
    appointments: [sample],
    selectedId: sample.id,
    view: 'home',
    showInviteCard: false,
    tab: '预约',
  };
}

function isAppointment(value: unknown): value is DemoAppointment {
  if (!value || typeof value !== 'object') return false;
  const item = value as DemoAppointment;
  const statuses = ['草稿', '待医院确认', '医院已同意', '已同步', '已撤销', '同步中'];
  return typeof item.id === 'string'
    && typeof item.hospital === 'string'
    && statuses.includes(item.status as string);
}

export function loadDemoSession(): DemoSession {
  try {
    const raw = sessionStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return createDefaultSession();
    const parsed = JSON.parse(raw) as Partial<DemoSession>;
    const appointments = Array.isArray(parsed.appointments)
      ? parsed.appointments.filter(isAppointment).map(item => ({
          ...item,
          status: (item.status as string) === '同步中' ? '医院已同意' : item.status,
          logs: Array.isArray(item.logs) ? item.logs : [],
        }))
      : [];
    if (!appointments.length) return createDefaultSession();
    const views: DemoView[] = ['home', 'create', 'detail', 'hospital'];
    const tabs: DemoTab[] = ['预约', '消息', '我的'];
    return {
      appointments,
      selectedId: appointments.some(a => a.id === parsed.selectedId)
        ? parsed.selectedId ?? appointments[0].id
        : appointments[0].id,
      view: views.includes(parsed.view as DemoView) ? parsed.view as DemoView : 'home',
      showInviteCard: Boolean(parsed.showInviteCard),
      tab: tabs.includes(parsed.tab as DemoTab) ? parsed.tab as DemoTab : '预约',
    };
  } catch {
    return createDefaultSession();
  }
}

export function saveDemoSession(session: DemoSession): void {
  try {
    sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* 演示环境写失败时忽略，内存状态仍可用 */
  }
}

export function clearDemoSession(): void {
  try {
    sessionStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function validateForm(input: DemoFormInput): DemoFormErrors {
  const errors: DemoFormErrors = {};
  if (!input.hospital.trim()) errors.hospital = '请选择医院';
  if (!input.department.trim()) errors.department = '请选择科室';
  if (!input.appointmentDate.trim()) errors.appointmentDate = '请选择预约日期';
  if (!input.appointmentTime.trim()) errors.appointmentTime = '请选择预计到院时间';
  if (!input.subject.trim()) errors.subject = '请填写拜访事项';
  return errors;
}

export function hasFormErrors(errors: DemoFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

function patch(
  session: DemoSession,
  id: string,
  updater: (item: DemoAppointment) => DemoAppointment,
  extra?: Partial<DemoSession>,
): DemoSession {
  return {
    ...session,
    appointments: session.appointments.map(item => item.id === id ? updater(item) : item),
    selectedId: id,
    ...extra,
  };
}

export function selectedAppointment(session: DemoSession): DemoAppointment | undefined {
  return session.appointments.find(item => item.id === session.selectedId)
    ?? session.appointments[0];
}

export function createSubmittedAppointment(session: DemoSession, input: DemoFormInput): DemoSession {
  const appointment: DemoAppointment = {
    id: nextId(),
    representativeName: DEMO_REP_NAME,
    hospital: input.hospital.trim(),
    department: input.department.trim(),
    appointmentDate: input.appointmentDate,
    appointmentTime: input.appointmentTime,
    subject: input.subject.trim(),
    remark: input.remark?.trim() || undefined,
    status: '待医院确认',
    logs: [
      log('已填写预约信息', `${input.hospital} · ${input.department}`),
      log('已提交预约', '可以发送给医院确认'),
    ],
  };
  return {
    ...session,
    appointments: [appointment, ...session.appointments],
    selectedId: appointment.id,
    view: 'detail',
    showInviteCard: false,
    tab: '预约',
  };
}

export function saveDraftEdits(session: DemoSession, id: string, input: DemoFormInput): DemoSession {
  return patch(session, id, item => ({
    ...item,
    hospital: input.hospital.trim(),
    department: input.department.trim(),
    appointmentDate: input.appointmentDate,
    appointmentTime: input.appointmentTime,
    subject: input.subject.trim(),
    remark: input.remark?.trim() || undefined,
    logs: [...item.logs, log('已更新预约信息')],
  }), { view: 'detail', showInviteCard: false });
}

export function submitDraft(session: DemoSession, id: string): DemoSession {
  return patch(session, id, item => {
    if (item.status !== '草稿') return item;
    return {
      ...item,
      status: '待医院确认',
      logs: [...item.logs, log('已提交预约', '可以发送给医院确认')],
    };
  }, { view: 'detail', showInviteCard: false });
}

export function markInviteSent(session: DemoSession, id: string): DemoSession {
  const stamp = nowStamp();
  return patch(session, id, item => {
    if (item.status !== '待医院确认' && item.status !== '草稿') return item;
    return {
      ...item,
      status: '待医院确认',
      sharedAt: stamp,
      logs: [...item.logs, log('已发送预约邀请', '等待医院确认')],
    };
  }, { view: 'detail', showInviteCard: true });
}

export function agreeAppointment(session: DemoSession, id: string): DemoSession {
  const stamp = nowStamp();
  return patch(session, id, item => {
    if (item.status !== '待医院确认') return item;
    return {
      ...item,
      status: '医院已同意',
      agreedAt: stamp,
      logs: [...item.logs, log('医院已同意预约')],
    };
  }, { view: 'hospital' });
}

export function markSynced(session: DemoSession, id: string): DemoSession {
  const stamp = nowStamp();
  return patch(session, id, item => {
    if (item.status !== '医院已同意') return item;
    return {
      ...item,
      status: '已同步',
      syncedAt: stamp,
      logs: [...item.logs, log('预约已同步到医药代表移动端')],
    };
  });
}

export function revokeAppointment(session: DemoSession, id: string): DemoSession {
  return patch(session, id, item => {
    if (item.status === '草稿' || item.status === '已撤销') return item;
    return {
      ...item,
      status: '已撤销',
      logs: [...item.logs, log('已撤销预约')],
    };
  }, { view: 'detail', showInviteCard: false });
}

export function jumpToStatus(
  session: DemoSession,
  id: string,
  target: '待医院确认' | '医院已同意' | '已同步',
): DemoSession {
  const stamp = nowStamp();
  return patch(session, id, item => {
    const next: DemoAppointment = {
      ...item,
      status: target,
      sharedAt: target === '待医院确认' || target === '医院已同意' || target === '已同步'
        ? item.sharedAt ?? stamp
        : item.sharedAt,
      agreedAt: target === '医院已同意' || target === '已同步' ? item.agreedAt ?? stamp : undefined,
      syncedAt: target === '已同步' ? item.syncedAt ?? stamp : undefined,
      logs: [
        ...item.logs,
        log(`已跳到「${target}」`, '演示控制'),
      ],
    };
    return next;
  }, {
    view: target === '医院已同意' ? 'hospital' : 'detail',
    showInviteCard: target === '待医院确认' || target === '医院已同意' || target === '已同步',
    tab: '预约',
  });
}

export function currentStepIndex(status: DemoDisplayStatus): number {
  return STATUS_STEP[status];
}

export function listStatusLabel(status: DemoAppointmentStatus): string {
  if (status === '已同步') return '已确认';
  return status;
}

export function listStatusKey(status: DemoAppointmentStatus): DemoDisplayStatus {
  return status === '已同步' ? '已同步' : status;
}

export type DemoMainAction =
  | { kind: 'submit'; label: string; disabled?: boolean }
  | { kind: 'share'; label: string; disabled?: boolean }
  | { kind: 'sync'; label: string; disabled?: boolean }
  | { kind: 'home'; label: string; disabled?: boolean }
  | { kind: 'restart'; label: string; disabled?: boolean };

export function mainActionFor(
  appointment: DemoAppointment,
  opts: { syncing: boolean; sharing: boolean; agreeing: boolean; showInviteCard: boolean },
): DemoMainAction {
  if (opts.sharing) return { kind: 'share', label: '正在生成预约邀请…', disabled: true };
  if (opts.agreeing) return { kind: 'sync', label: '正在确认…', disabled: true };
  if (opts.syncing) return { kind: 'sync', label: '正在同步预约…', disabled: true };

  switch (appointment.status) {
    case '草稿':
      return { kind: 'submit', label: '提交预约' };
    case '待医院确认':
      return appointment.sharedAt || opts.showInviteCard
        ? { kind: 'share', label: '已发送，等待医院同意', disabled: true }
        : { kind: 'share', label: '发送预约小程序转发许可' };
    case '医院已同意':
      return { kind: 'sync', label: '同步到医药代表移动端' };
    case '已同步':
      return { kind: 'home', label: '返回我的预约' };
    case '已撤销':
      return { kind: 'restart', label: '重新发起预约' };
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
