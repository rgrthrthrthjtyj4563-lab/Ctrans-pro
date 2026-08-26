import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PROVINCES, REGION_NATIONWIDE } from '../constants';

interface RegionPickerProps {
  value: string[];
  onChange: (regions: string[]) => void;
  disabled?: boolean;
  allowNationwide?: boolean;
}

/**
 * 省级行政区搜索式多选。落库值 = 省名或「全国」。
 */
export function RegionPicker({
  value,
  onChange,
  disabled,
  allowNationwide = true,
}: RegionPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  function toggle(region: string) {
    if (disabled) return;
    if (region === REGION_NATIONWIDE) {
      onChange(value.includes(REGION_NATIONWIDE) ? [] : [REGION_NATIONWIDE]);
      return;
    }
    const withoutNation = value.filter((r) => r !== REGION_NATIONWIDE);
    onChange(
      withoutNation.includes(region)
        ? withoutNation.filter((r) => r !== region)
        : [...withoutNation, region],
    );
  }

  const q = query.trim();
  const list = useMemo(() => {
    return PROVINCES.filter((p) => !q || p.includes(q));
  }, [q]);

  const showNationwide = allowNationwide && (!q || REGION_NATIONWIDE.includes(q));
  const countLabel = value.includes(REGION_NATIONWIDE)
    ? '全国'
    : `${value.length} 个省级区域`;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          minHeight: 42,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 12px',
          background: '#fff',
          border: '1px solid #D0D5DD',
          borderRadius: 8,
          color: value.length ? '#1F2937' : '#98A2B3',
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span>{value.length ? `${value.slice(0, 3).join('、')}${value.length > 3 ? ` 等 ${value.length} 个区域` : ''}` : '请选择省级行政区'}</span>
        <span style={{ fontSize: 12 }}>⌄</span>
      </button>

      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {value.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => toggle(r)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                padding: '3px 8px',
                borderRadius: 999,
                border: '1px solid #A7F3D0',
                background: '#E8F4F1',
                color: '#176B5B',
                cursor: 'pointer',
              }}
            >
              {r}
              <X size={12} />
            </button>
          ))}
        </div>
      )}

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{
            position: 'absolute',
            zIndex: 21,
            top: 48,
            left: 0,
            right: 0,
            minWidth: 300,
            padding: 10,
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(16,24,40,.14)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: '1px solid #E5E7EB',
              borderRadius: 7,
              padding: '7px 9px',
              marginBottom: 8,
            }}>
              <Search size={14} color="#98A2B3" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索省份"
                style={{ border: 0, outline: 0, width: '100%', fontSize: 13 }}
              />
            </div>

            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {showNationwide && (
                <div style={{ marginBottom: 6 }}>
                  {renderOption(REGION_NATIONWIDE, value, toggle, true)}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {list.map((p) => renderOption(p, value, toggle, false))}
              </div>
              {list.length === 0 && !showNationwide && (
                <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: 12, color: '#98A2B3' }}>
                  未找到匹配的区域
                </div>
              )}
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px solid #F2F4F7',
            }}>
              <span style={{ fontSize: 12, color: '#98A2B3' }}>已选 {countLabel}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ border: 0, background: '#176B5B', color: '#fff', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}
              >
                完成
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function renderOption(
  r: string,
  value: string[],
  toggle: (region: string) => void,
  nationwide: boolean,
) {
  const active = value.includes(r);
  return (
    <button
      key={r}
      type="button"
      onClick={() => toggle(r)}
      style={{
        padding: '7px 4px',
        borderRadius: 6,
        border: `1px solid ${active ? '#176B5B' : '#F2F4F7'}`,
        background: active ? '#E8F4F1' : '#fff',
        color: active ? '#176B5B' : '#344054',
        fontSize: 12,
        cursor: 'pointer',
        fontWeight: nationwide ? 700 : 400,
        whiteSpace: 'nowrap',
      }}
    >
      {r}
    </button>
  );
}
