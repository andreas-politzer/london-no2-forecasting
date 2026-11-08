import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { UI } from './texts'

type Props = {
  title?: string
  short: string
  more?: string
  align?: 'left' | 'right'
  ariaLabel?: string
  children?: ReactNode
}

// Click/tap popover. The trigger is a small "i" by default, or any content
// passed as children (for example a table value).
export default function InfoPopover({
  title,
  short,
  more,
  align = 'left',
  ariaLabel,
  children,
}: Props) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
        setExpanded(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setExpanded(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle() {
    if (open) {
      setOpen(false)
      setExpanded(false)
    } else {
      setOpen(true)
    }
  }

  function close() {
    setOpen(false)
    setExpanded(false)
    buttonRef.current?.focus()
  }

  return (
    <span className="info" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className="info-trigger"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={ariaLabel ?? title ?? UI.moreLabel}
        onClick={toggle}
      >
        {children ?? 'i'}
      </button>
      {open && (
        <span
          id={panelId}
          role="dialog"
          aria-label={title ?? short}
          className={`info-panel info-panel-${align}`}
        >
          {title && <strong className="info-title">{title}</strong>}
          <span className="info-text">{short}</span>
          {more && expanded && <span className="info-text info-more">{more}</span>}
          <span className="info-actions">
            {more && !expanded && (
              <button
                type="button"
                className="info-link"
                onClick={() => setExpanded(true)}
              >
                {UI.moreLabel}
              </button>
            )}
            <button type="button" className="info-link" onClick={close}>
              {UI.closeLabel}
            </button>
          </span>
        </span>
      )}
    </span>
  )
}