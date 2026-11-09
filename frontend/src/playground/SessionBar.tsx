import { useRef, useState, type ChangeEvent } from 'react'
import { PGU } from './labels'
import type { PlaygroundSession } from './useSession'

type Props = { session: PlaygroundSession }

function download(fileName: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

// Sharing, saving in the browser, and files: the buttons around the pure
// functions of persist.ts.
export default function SessionBar({ session }: Props) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [manualLink, setManualLink] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function share() {
    const url = session.shareLink()
    try {
      await navigator.clipboard.writeText(url)
      setManualLink(null)
      setMessage(PGU.sessionShared)
    } catch {
      setManualLink(url)
      setMessage(PGU.sessionLinkManual)
    }
  }

  function save() {
    const result = session.saveCurrent(name)
    if (result.ok) {
      setMessage(PGU.sessionSaved(name.trim()))
      return
    }
    setMessage(
      result.reason === 'name'
        ? PGU.sessionSaveNameMissing
        : result.reason === 'full'
          ? PGU.sessionSaveFull
          : PGU.sessionSaveFailed,
    )
  }

  function exportFile() {
    const { fileName, text } = session.exportCurrent(name.trim() || 'experiment')
    download(fileName, text)
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = session.importText(await file.text())
    setMessage(result.ok ? PGU.sessionImported(result.name) : PGU.sessionImportFailed[result.reason])
  }

  return (
    <div className="pgx-session">
      <div className="pgx-session-row">
        <button type="button" className="pgx-btn" onClick={() => void share()}>
          {PGU.sessionShare}
        </button>
        <button type="button" className="pgx-btn" onClick={exportFile}>
          {PGU.sessionExport}
        </button>
        <button type="button" className="pgx-btn" onClick={() => fileRef.current?.click()}>
          {PGU.sessionImport}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="pgx-hidden-input"
          aria-label={PGU.sessionImport}
          onChange={(event) => void importFile(event)}
        />
        <button type="button" className="pgx-btn" onClick={session.reset}>
          {PGU.sessionReset}
        </button>
        <input
          type="text"
          className="pgx-name"
          placeholder={PGU.sessionSaveName}
          aria-label={PGU.sessionSaveName}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="button" className="pgx-btn pgx-btn-primary" onClick={save}>
          {PGU.sessionSave}
        </button>
      </div>

      <div className="pgx-session-msg" role="status" aria-live="polite">
        {message}
        {manualLink && <input className="pgx-link" readOnly value={manualLink} onFocus={(event) => event.target.select()} />}
      </div>

      <details className="pgx-saved">
        <summary>
          {PGU.sessionSavedTitle} ({session.saved.length})
        </summary>
        {session.saved.length === 0 ? (
          <p className="pgx-muted">{PGU.sessionNone}</p>
        ) : (
          <ul>
            {session.saved.map((item) => (
              <li key={item.id}>
                <span className="pgx-saved-name">{item.name}</span>
                <span className="pgx-muted">{new Date(item.savedAt).toLocaleDateString('de-DE')}</span>
                <button
                  type="button"
                  className="pgx-btn"
                  onClick={() => {
                    session.loadSaved(item.id)
                    setName(item.name)
                  }}
                >
                  {PGU.sessionLoad}
                </button>
                <button
                  type="button"
                  className="pgx-btn"
                  onClick={() => {
                    if (!session.removeSaved(item.id)) setMessage(PGU.sessionDeleteFailed)
                  }}
                >
                  {PGU.sessionDelete}
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  )
}
