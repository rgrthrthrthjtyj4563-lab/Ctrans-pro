import { Users } from 'lucide-react';
import { Tag } from './StatusTag';
import { formatCNY } from '../context/TaskDataContext';
import { workloadStageLabel } from '../context/TaskDataContext';
import type { Task } from '../types';

interface TaskAllocationViewProps {
  task: Task;
}

/** 任务详情内的工作组 / 专员分配视图（桌面模拟） */
export function TaskAllocationView({ task }: TaskAllocationViewProps) {
  return (
    <div style={{ border: '1px solid #E7EAEE', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: '#F8FAFA', fontSize: 12, color: '#667085' }}>
        {workloadStageLabel(task)}
      </div>
      {task.workgroupSplits.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: '#98A2B3' }}>尚未拆解到工作组</div>
      ) : task.workgroupSplits.map((wg) => {
        const assigns = task.workloadAssigns.filter((a) => a.workGroup === wg.workGroup);
        return (
          <div key={wg.id} style={{ padding: '12px 14px', borderTop: '1px solid #E7EAEE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 650 }}>
              <Users size={14} color="#176B5B" />
              {wg.workGroup}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{formatCNY(wg.amount)}</span>
              <Tag label={assigns.length ? '已分配到专员' : '已拆解到工作组'} color={assigns.length ? 'success' : 'warning'} />
            </div>
            {assigns.map((a) => (
              <div key={a.id} style={{ padding: '8px 0 0 28px', fontSize: 12, color: '#344054', display: 'flex', gap: 16 }}>
                <span>{a.specialist}</span>
                <span>工作量 {a.workload}</span>
                <span>{formatCNY(a.amount)}</span>
                <span>{a.progress}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
