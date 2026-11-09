import { useCallback, useState } from 'react'
import {
  decodeShare,
  deleteExperiment,
  exportExperiment,
  exportFileName,
  importExperiment,
  listExperiments,
  saveExperiment,
  shareUrl,
  type ImportResult,
  type KeyValueStore,
  type SaveResult,
  type SavedExperiment,
} from './persist'
import { defaultState, type PlaygroundState, type StateContext } from './state'

// Holds the playground state in React and wires it to sharing, local saving
// and file export. All decisions live in pure functions (persist.ts, state.ts,
// resolveInitial below); this file only connects them to the browser.

export type Notice =
  | { kind: 'share-broken' } // the link in the address bar could not be read
  | { kind: 'share-version' } // the link comes from another version
  | { kind: 'share-repaired'; repairs: string[] } // some parts were repaired

// What the playground shows when it opens: the shared state from the address
// bar if there is one, otherwise the default state. A broken or foreign link
// never silently looks like a normal start: it comes with a notice.
export function resolveInitial(
  hash: string,
  ctx: StateContext,
): { state: PlaygroundState; notice: Notice | null } {
  const shared = decodeShare(hash, ctx)
  if (shared.status === 'none') {
    return { state: defaultState(ctx), notice: null }
  }
  if (shared.status === 'broken') {
    return { state: defaultState(ctx), notice: { kind: 'share-broken' } }
  }
  const { state, repairs } = shared.result
  if (repairs.includes('version')) {
    return { state, notice: { kind: 'share-version' } }
  }
  if (repairs.includes('state')) {
    return { state, notice: { kind: 'share-broken' } }
  }
  return {
    state,
    notice: repairs.length > 0 ? { kind: 'share-repaired', repairs } : null,
  }
}

// Access to localStorage can throw (private window, blocked site data): reading
// then behaves like an empty storage, writing is reported by saveExperiment.
const browserStorage: KeyValueStore = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    window.localStorage.setItem(key, value)
  },
}

export type PlaygroundSession = {
  state: PlaygroundState
  update: (change: (previous: PlaygroundState) => PlaygroundState) => void
  replace: (next: PlaygroundState) => void
  reset: () => void
  notice: Notice | null
  dismissNotice: () => void
  saved: SavedExperiment[]
  saveCurrent: (name: string) => SaveResult
  loadSaved: (id: string) => boolean
  removeSaved: (id: string) => boolean
  shareLink: () => string
  exportCurrent: (name: string) => { fileName: string; text: string }
  importText: (text: string) => ImportResult
}

// ctx must be stable between renders (the caller keeps it in useMemo).
export function usePlaygroundSession(ctx: StateContext): PlaygroundSession {
  const [initial] = useState(() => resolveInitial(window.location.hash, ctx))
  const [state, setState] = useState<PlaygroundState>(initial.state)
  const [notice, setNotice] = useState<Notice | null>(initial.notice)
  const [saved, setSaved] = useState<SavedExperiment[]>(() =>
    listExperiments(browserStorage, ctx),
  )

  const update = useCallback(
    (change: (previous: PlaygroundState) => PlaygroundState) => setState(change),
    [],
  )
  const replace = useCallback((next: PlaygroundState) => setState(next), [])
  const reset = useCallback(() => setState(defaultState(ctx)), [ctx])
  const dismissNotice = useCallback(() => setNotice(null), [])

  const saveCurrent = useCallback(
    (name: string): SaveResult => {
      const result = saveExperiment(browserStorage, ctx, name, state, new Date())
      if (result.ok) setSaved(result.experiments)
      return result
    },
    [ctx, state],
  )

  const loadSaved = useCallback(
    (id: string): boolean => {
      const found = saved.find((item) => item.id === id)
      if (!found) return false
      setState(found.state)
      return true
    },
    [saved],
  )

  const removeSaved = useCallback(
    (id: string): boolean => {
      const rest = deleteExperiment(browserStorage, ctx, id)
      if (rest === null) return false
      setSaved(rest)
      return true
    },
    [ctx],
  )

  const shareLink = useCallback(
    () => shareUrl(window.location.href, state),
    [state],
  )

  const exportCurrent = useCallback(
    (name: string) => {
      const now = new Date()
      return {
        fileName: exportFileName(name, now),
        text: exportExperiment(name, state, now),
      }
    },
    [state],
  )

  const importText = useCallback(
    (text: string): ImportResult => {
      const result = importExperiment(text, ctx)
      if (result.ok) setState(result.state)
      return result
    },
    [ctx],
  )

  return {
    state,
    update,
    replace,
    reset,
    notice,
    dismissNotice,
    saved,
    saveCurrent,
    loadSaved,
    removeSaved,
    shareLink,
    exportCurrent,
    importText,
  }
}