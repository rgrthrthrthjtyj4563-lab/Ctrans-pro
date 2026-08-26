import { Video, MapPin, Camera, Activity, ClipboardCheck } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { getRoleDashboardData } from '../data/mockData';
import type { ToastMessage } from '../components/Toast';
import type { DashboardStatItem } from '../types';

const toneColor: Record<string, string> = {
  brand: '#176B5B',
  success: '#248A5A',
  warning: '#C77A16',
  danger: '#C73A3A',
  info: '#2F6BCE',
  neutral: '#6B7280',
};

const panelStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E5E7EB',
  borderRadius: 10,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const rowStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderTop: '1px solid #F3F4F6',
};

function PanelHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid #E5E7EB', background: '#FAFBFC' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{title}</span>
      </div>
      <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 4 }}>{subtitle}</div>
    </div>
  );
}

export function InspectionWorkbench({ addToast }: { addToast: (msg: Omit<ToastMessage, 'id'>) => void }) {
  const data = getRoleDashboardData('药厂合规部门').inspectionWorkbench;
  if (!data) return null;
  const { recommended, active, pending } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="随检工作台"
        description="行为·过程管控：AI 推荐过程随检 → 进行中随检跟踪（摄像头 + 定位）→ 完成后抽检结果处理"
        dataRange="数据范围：今日 · 随检引擎"
        updatedAt="更新于今日 09:30"
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, alignItems: 'start' }}>

          {/* 过程随检 · AI 推荐 */}
          <div style={panelStyle}>
            <PanelHeader
              icon={<Camera size={15} style={{ color: '#C73A3A' }} />}
              title="过程随检 · AI 推荐"
              subtitle="随检引擎按风险分排序，高风险任务已置顶"
            />
            {recommended.map((item: DashboardStatItem) => (
              <div key={item.id} style={rowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{item.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: toneColor[item.tone || 'neutral'], whiteSpace: 'nowrap' }}>
                    {item.value}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>{item.hint}</div>
                <div style={{ marginTop: 10 }}>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Camera size={13} />}
                    onClick={() => addToast({
                      type: 'success',
                      title: '已发起随检',
                      description: `${item.label} 已加入进行中随检列表，请跟踪摄像头与定位状态。`,
                    })}
                  >
                    发起随检
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* 过程随检 · 进行中 */}
          <div style={panelStyle}>
            <PanelHeader
              icon={<Activity size={15} style={{ color: '#248A5A' }} />}
              title="过程随检 · 进行中"
              subtitle="摄像头与定位实时状态，弱信号任务需重点关注"
            />
            {active.map((item: DashboardStatItem) => {
              const cameraOn = item.hint?.includes('摄像头在线');
              const locationOk = item.hint?.includes('定位正常');
              const locationWarn = item.hint?.includes('弱信号');
              return (
                <div key={item.id} style={rowStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{item.label}</span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#248A5A',
                      background: '#E6F5ED',
                      borderRadius: 999,
                      padding: '2px 8px',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.value}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: cameraOn ? '#248A5A' : '#C73A3A' }}>
                      <Video size={13} />
                      {cameraOn ? '摄像头在线' : '摄像头离线'}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: locationOk ? '#248A5A' : locationWarn ? '#C77A16' : '#C73A3A' }}>
                      <MapPin size={13} />
                      {locationOk ? '定位正常' : locationWarn ? '定位弱信号' : '定位异常'}
                    </span>
                  </div>
                  {item.hint && (
                    <div style={{ fontSize: 12, color: '#667085', marginTop: 6 }}>{item.hint}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 完成后抽检 · 结果待处理 */}
          <div style={panelStyle}>
            <PanelHeader
              icon={<ClipboardCheck size={15} style={{ color: '#2F6BCE' }} />}
              title="完成后抽检 · 结果待处理"
              subtitle="随检完成后的抽检结果，待人工裁定与关闭"
            />
            {pending.map((item: DashboardStatItem) => (
              <div key={item.id} style={rowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: toneColor[item.tone || 'neutral'], whiteSpace: 'nowrap' }}>
                    {item.value}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>{item.hint}</div>
                <div style={{ marginTop: 10 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addToast({
                      type: 'info',
                      title: '已进入结果处理',
                      description: `${item.label}（${item.value}），演示环境仅作提示。`,
                    })}
                  >
                    去处理
                  </Button>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
