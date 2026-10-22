/**
 * 药厂业务开关状态 hook：
 * - live / drafts / history 三段状态 + 按药厂作用域持久化
 * - saveRule 只写草稿（与生效值相同则移除，不产生虚假修改）
 * - publish：先校验冲突，通过后合并草稿 → 版本递增 → 保留快照 → 清空草稿
 * 成果验收共享上下文的同步由页面在发布成功后执行（草稿阶段不提前生效）。
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  conflictsOf,
  getRule,
  loadSwitchState,
  normalizeSwitchConfig,
  nowSwitchStamp,
  persistSwitchState,
  sameRule,
  switchKey,
  type SwitchProviderRef,
  type SwitchRule,
  type SwitchState,
} from "../data/pharmaSwitchRules"

export interface PublishResult {
  ok: boolean
  /** 冲突明细（ok=false 且非空时展示） */
  errors: string[]
  version?: number
  count?: number
}

export function usePharmaSwitchConfig(pharmaId: string, providers: SwitchProviderRef[]) {
  const [state, setState] = useState<SwitchState>(() => loadSwitchState(pharmaId, providers))
  const [storageError, setStorageError] = useState(false)

  // 药厂作用域切换（会话重建之外的兜底）：整体换装载入，避免串药厂数据
  useEffect(() => {
    setState(loadSwitchState(pharmaId, providers))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmaId])

  useEffect(() => {
    setStorageError(!persistSwitchState(pharmaId, state).ok)
  }, [pharmaId, state])

  const merged = useMemo(() => ({ ...state.live, ...state.drafts }), [state])
  const version = state.history[0]?.version ?? 1
  const draftCount = Object.keys(state.drafts).length
  const conflicts = useMemo(() => conflictsOf(merged, providers), [merged, providers])

  const saveRule = useCallback(
    (ownerKey: string, scene: string, rule: SwitchRule, base?: SwitchRule) => {
      setState((prev) => {
        const key = switchKey(ownerKey, scene, rule.name)
        const fallback = base ?? rule
        // 与当前生效解析值相同 → 不入草稿；已在草稿中则移除（还原"无修改"）
        if (sameRule(getRule(prev.live, ownerKey, scene, fallback), rule)) {
          if (!prev.drafts[key]) return prev
          const drafts = { ...prev.drafts }
          delete drafts[key]
          return { ...prev, drafts }
        }
        return { ...prev, drafts: { ...prev.drafts, [key]: rule } }
      })
    },
    [],
  )

  const discardDrafts = useCallback(() => {
    setState((prev) => ({ ...prev, drafts: {} }))
  }, [])

  const publish = useCallback((): PublishResult => {
    const count = Object.keys(state.drafts).length
    if (!count) return { ok: false, errors: ["暂无待发布修改"] }
    const mergedNow = { ...state.live, ...state.drafts }
    const errors = conflictsOf(mergedNow, providers)
    if (errors.length) return { ok: false, errors }
    const config = normalizeSwitchConfig(mergedNow, providers)
    const nextVersion = version + 1
    setState({
      live: config,
      drafts: {},
      history: [
        {
          version: nextVersion,
          date: nowSwitchStamp(),
          config,
          note: `发布${count}项配置调整`,
        },
        ...state.history,
      ],
    })
    return { ok: true, errors: [], version: nextVersion, count }
  }, [state, providers, version])

  return {
    state,
    merged,
    version,
    draftCount,
    conflicts,
    storageError,
    saveRule,
    discardDrafts,
    publish,
  }
}
