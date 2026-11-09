import {
  parseState,
  serializeState,
  STATE_VERSION,
  type ParseResult,
  type PlaygroundState,
  type StateContext,
} from './state'

// Saving, sharing and exporting experiments. Pure functions: the browser
// storage is passed in (KeyValueStore), so everything is testable without a
// browser. Every incoming state goes through parseState.

export const SHARE_PREFIX = 'pg='
export const EXPORT_FORMAT = 'no2-playground-experiment'
export const STORAGE_KEY = 'no2-playground-experiments-v1'
export const MAX_SAVED = 50
export const MAX_NAME = 80

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ---------------------------------------------------------------- share link

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string | null {
  try {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

// The part after "#", e.g. "pg=eyJ2ZXJzaW9uIjox...".
export function encodeShare(state: PlaygroundState): string {
  return `${SHARE_PREFIX}${toBase64Url(serializeState(state))}`
}

export function shareUrl(pageUrl: string, state: PlaygroundState): string {
  return `${pageUrl.split('#')[0]}#${encodeShare(state)}`
}

export type ShareResult =
  | { status: 'none' } // the hash is not a share link at all
  | { status: 'broken' } // a share link that cannot be decoded
  | { status: 'ok'; result: ParseResult }

// A decoded link with a wrong version gives the default state and the repair
// code "version"; the caller shows a notice then.
export function decodeShare(hash: string, ctx: StateContext): ShareResult {
  const text = hash.startsWith('#') ? hash.slice(1) : hash
  if (!text.startsWith(SHARE_PREFIX)) return { status: 'none' }
  const json = fromBase64Url(text.slice(SHARE_PREFIX.length))
  if (json === null) return { status: 'broken' }
  try {
    return { status: 'ok', result: parseState(JSON.parse(json), ctx) }
  } catch {
    return { status: 'broken' }
  }
}

// -------------------------------------------------------------- local saving

export type KeyValueStore = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type SavedExperiment = {
  id: string
  name: string
  savedAt: string
  state: PlaygroundState
}

function readList(store: KeyValueStore): unknown[] {
  try {
    const text = store.getItem(STORAGE_KEY)
    if (text === null) return []
    const raw: unknown = JSON.parse(text)
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function writeList(store: KeyValueStore, list: unknown[]): boolean {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

function newId(now: Date): string {
  return `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// Entries with a broken structure or an unreadable (e.g. newer) state version
// are left out of the list. They are not deleted from the storage.
export function listExperiments(
  store: KeyValueStore,
  ctx: StateContext,
): SavedExperiment[] {
  const out: SavedExperiment[] = []
  for (const item of readList(store)) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.savedAt !== 'string'
    ) {
      continue
    }
    if (!isRecord(item.state) || item.state.version !== STATE_VERSION) continue
    out.push({
      id: item.id,
      name: item.name,
      savedAt: item.savedAt,
      state: parseState(item.state, ctx).state,
    })
  }
  return out
}

export type SaveResult =
  | { ok: true; experiments: SavedExperiment[] }
  | { ok: false; reason: 'name' | 'full' | 'storage' }

// Saving under an existing name replaces that experiment.
export function saveExperiment(
  store: KeyValueStore,
  ctx: StateContext,
  name: string,
  state: PlaygroundState,
  now: Date,
): SaveResult {
  const clean = name.trim().slice(0, MAX_NAME)
  if (clean === '') return { ok: false, reason: 'name' }
  const raw = readList(store)
  const index = raw.findIndex((item) => isRecord(item) && item.name === clean)
  const existing = index >= 0 ? raw[index] : null
  const id =
    isRecord(existing) && typeof existing.id === 'string'
      ? existing.id
      : newId(now)
  const entry = { id, name: clean, savedAt: now.toISOString(), state }
  if (index >= 0) raw[index] = entry
  else if (raw.length >= MAX_SAVED) return { ok: false, reason: 'full' }
  else raw.push(entry)
  if (!writeList(store, raw)) return { ok: false, reason: 'storage' }
  return { ok: true, experiments: listExperiments(store, ctx) }
}

// null when the storage could not be written.
export function deleteExperiment(
  store: KeyValueStore,
  ctx: StateContext,
  id: string,
): SavedExperiment[] | null {
  const raw = readList(store).filter(
    (item) => !(isRecord(item) && item.id === id),
  )
  if (!writeList(store, raw)) return null
  return listExperiments(store, ctx)
}

// ------------------------------------------------------------ JSON file I/O

export function exportExperiment(
  name: string,
  state: PlaygroundState,
  now: Date,
): string {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: STATE_VERSION,
      name,
      exportedAt: now.toISOString(),
      state,
    },
    null,
    2,
  )
}

export function exportFileName(name: string, now: Date): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `no2-playground-${slug || 'experiment'}-${now.toISOString().slice(0, 10)}.json`
}

export type ImportResult =
  | { ok: true; name: string; state: PlaygroundState; repairs: string[] }
  | { ok: false; reason: 'json' | 'format' | 'version' | 'state' }

// A file whose state has the wrong version is rejected. Silently importing the
// default state instead would pretend to be the experiment.
export function importExperiment(text: string, ctx: StateContext): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'json' }
  }
  if (!isRecord(raw) || raw.format !== EXPORT_FORMAT) {
    return { ok: false, reason: 'format' }
  }
  if (raw.version !== STATE_VERSION) return { ok: false, reason: 'version' }
  if (!isRecord(raw.state) || raw.state.version !== STATE_VERSION) {
    return { ok: false, reason: 'state' }
  }
  const { state, repairs } = parseState(raw.state, ctx)
  const name =
    typeof raw.name === 'string' && raw.name.trim() !== ''
      ? raw.name.trim().slice(0, MAX_NAME)
      : 'Import'
  return { ok: true, name, state, repairs }
}