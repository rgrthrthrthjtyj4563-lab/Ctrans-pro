import { Ban } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import type { ToastMessage } from '../components/Toast';
import type { NavigateFn, Role } from '../types';
import { usePermission } from '../context/PermissionContext';
import { MyTasksTab } from './vendor-access/ApplicationTab';
import { RecordsTab } from './vendor-access/RecordsTab';

/**
 * 服务商准入 · 服务商侧页面壳（2026-09-21 药厂发起制）
 * 只承载服务商侧：准入任务（领取/提交）与提交记录两个菜单入口；药厂工作空间的
 * vendor-access 入口由 App 路由分发给药厂侧任务页（PharmaAccessTasks）。
 * 服务商侧不提供药厂搜索、药厂浏览或自主发起入口（药厂是唯一发起方）。
 */

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole?: Role;
  /** main=准入任务(服务商)；records=服务商提交记录 */
  view?: 'main' | 'records';
  /** 跨页跳转（保留签名兼容既有调用点） */
  navigate?: NavigateFn;
}

export function VendorAccessManage({ addToast, currentRole, view = 'main', navigate }: Props) {
  void currentRole;
  void navigate;
  const { can } = usePermission();
  // 分支按当前角色的动作权限判定（与既有口径一致）：服务商侧须具备材料提交权限
  const canMaintain = can('vendor-access', 'submit');
  // 药厂侧审核角色误入本壳（旧链接/菜单缓存）时 EmptyState 指回药厂侧任务页
  const isReviewer = can('vendor-access', 'approve');

  if (!canMaintain) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          icon={Ban}
          title={isReviewer ? '请从药厂工作空间进入' : '无权访问'}
          description={isReviewer
            ? '药厂侧的准入任务与审核在「合作与授权 › 服务商准入」，请切换到药厂工作空间操作。'
            : '服务商准入模块仅对服务商（材料提交方）开放，当前登录角色未开通该页面的操作权限。'}
        />
      </div>
    );
  }

  if (view === 'records') {
    return <RecordsTab addToast={addToast} />;
  }

  return <MyTasksTab addToast={addToast} />;
}
