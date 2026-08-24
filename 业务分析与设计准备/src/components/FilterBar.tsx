import { useState, type ReactNode } from 'react';
import { Search, RotateCcw, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Button } from './Button';

interface FilterField {
  id: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'daterange';
  placeholder?: string;
  options?: { value: string; label: string }[];
  width?: number;
}

interface FilterBarProps {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  onSearch: () => void;
  onReset: () => void;
  extraActions?: ReactNode;
  stats?: ReactNode;
  collapsedCount?: number;
}

export function FilterBar({
  fields,
  values,
  onChange,
  onSearch,
  onReset,
  extraActions,
  stats,
  collapsedCount = 4,
}: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? fields : fields.slice(0, collapsedCount);
  const hasMore = fields.length > collapsedCount;

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #E5E7EB',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: 12,
    }}>
      {/* Filter inputs */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        alignItems: 'flex-end',
      }}>
        {visible.map(field => (
          <div key={field.id} style={{ width: field.width || 180 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              color: '#9CA3AF',
              marginBottom: 4,
              fontWeight: 500,
            }}>
              {field.label}
            </label>
            {field.type === 'select' ? (
              <div style={{ position: 'relative' }}>
                <select
                  value={values[field.id] || ''}
                  onChange={e => onChange(field.id, e.target.value)}
                  style={{
                    width: '100%',
                    height: 32,
                    padding: '0 28px 0 10px',
                    fontSize: 13,
                    color: values[field.id] ? '#1F2937' : '#9CA3AF',
                    background: '#FFFFFF',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    appearance: 'none',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="">{field.placeholder || `选择${field.label}`}</option>
                  {field.options?.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown size={13} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
              </div>
            ) : field.type === 'date' || field.type === 'daterange' ? (
              <input
                type="date"
                value={values[field.id] || ''}
                onChange={e => onChange(field.id, e.target.value)}
                style={{
                  width: '100%',
                  height: 32,
                  padding: '0 10px',
                  fontSize: 13,
                  color: '#1F2937',
                  background: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            ) : (
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                <input
                  type="text"
                  value={values[field.id] || ''}
                  onChange={e => onChange(field.id, e.target.value)}
                  placeholder={field.placeholder || `搜索${field.label}`}
                  onKeyDown={e => { if (e.key === 'Enter') onSearch(); }}
                  style={{
                    width: '100%',
                    height: 32,
                    padding: '0 10px 0 28px',
                    fontSize: 13,
                    color: '#1F2937',
                    background: '#FFFFFF',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            )}
          </div>
        ))}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginLeft: 'auto' }}>
          {hasMore && (
            <Button
              variant="ghost"
              size="md"
              icon={<SlidersHorizontal size={14} />}
              iconAfter={<ChevronDown size={12} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />}
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? '收起' : '高级筛选'}
            </Button>
          )}
          <Button variant="outline" size="md" icon={<RotateCcw size={14} />} onClick={onReset}>重置</Button>
          <Button variant="primary" size="md" icon={<Search size={14} />} onClick={onSearch}>查询</Button>
        </div>
      </div>

      {/* Stats + extra actions */}
      {(stats || extraActions) && (
        <div style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid #F3F4F6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>{stats}</div>
          <div style={{ display: 'flex', gap: 8 }}>{extraActions}</div>
        </div>
      )}
    </div>
  );
}
