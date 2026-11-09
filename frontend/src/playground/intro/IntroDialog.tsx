import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Intro, IntroBlock, IntroItem } from './introContent'

type Props = { intro: Intro; onClose: () => void }

function Items({ items, ordered }: { items: IntroItem[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag className="pgi-list">
      {items.map((item) => (
        <li key={item.lead ?? item.text}>
          {item.lead && <strong>{item.lead}: </strong>}
          {item.text}
        </li>
      ))}
    </Tag>
  )
}

function Block({ block }: { block: IntroBlock }) {
  if (block.kind === 'p') return <p>{block.text}</p>
  if (block.kind === 'list') return <Items items={block.items} />
  if (block.kind === 'steps') return <Items items={block.items} ordered />
  return (
    <div className="pgi-warn" role="note">
      <strong>{block.title}</strong>
      <p>{block.text}</p>
    </div>
  )
}

// The introduction: a box with the first steps that is always visible, a table
// of contents whose links open the section they point to, collapsible
// sections and a glossary.
export default function IntroDialog({ intro, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const pending = useRef<string | null>(null)
  const [jumps, setJumps] = useState(0)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // After a link opened a section, bring it into view.
  useEffect(() => {
    const id = pending.current
    if (id === null) return
    pending.current = null
    const element = rootRef.current?.querySelector<HTMLElement>(`#pgi-${id}`)
    if (!element) return
    element.scrollIntoView({ block: 'start' })
    const summary = element.querySelector<HTMLElement>('summary')
    ;(summary ?? element).focus({ preventScroll: true })
  }, [jumps])

  const setSectionOpen = (id: string, value: boolean) =>
    setOpen((previous) => {
      if (previous.has(id) === value) return previous
      const next = new Set(previous)
      if (value) next.add(id)
      else next.delete(id)
      return next
    })

  const jump = (id: string) => {
    if (id !== 'start') setSectionOpen(id, true)
    pending.current = id
    setJumps((count) => count + 1)
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !rootRef.current) return
    event.stopPropagation()
    const focusable = rootRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="pgi" role="dialog" aria-modal="true" aria-labelledby="pgi-title" ref={rootRef} onKeyDown={onKeyDown}>
      <div className="pgi-inner">
        <header className="pgi-head">
          <h2 id="pgi-title" className="panel-title">
            {intro.title}
          </h2>
          <button ref={closeRef} type="button" className="pgx-btn" onClick={onClose}>
            Schließen
          </button>
        </header>

        <p className="pgi-lead">{intro.lead}</p>

        <section id="pgi-start" className="pgi-start" tabIndex={-1} aria-labelledby="pgi-start-title">
          <h3 id="pgi-start-title">{intro.start.title}</h3>
          <Items items={intro.start.steps} ordered />
        </section>

        <nav className="pgi-toc" aria-label="Inhalt">
          <span className="pgx-field-label">Inhalt</span>
          <ol>
            {intro.toc.map((entry, index) => (
              <li key={entry.id}>
                <button type="button" className="pgi-link" onClick={() => jump(entry.id)}>
                  {index + 1}. {entry.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {intro.sections.map((section) => (
          <details
            key={section.id}
            id={`pgi-${section.id}`}
            className="pgi-section"
            open={open.has(section.id)}
            onToggle={(event) => setSectionOpen(section.id, event.currentTarget.open)}
          >
            <summary>
              <span className="pgi-section-title">{section.title}</span>
              <span className="pgi-section-sum">{section.summary}</span>
            </summary>
            <div className="pgi-body">
              {section.blocks.map((block, index) => (
                <Block key={index} block={block} />
              ))}
            </div>
          </details>
        ))}

        <details
          id="pgi-glossary"
          className="pgi-section"
          open={open.has('glossary')}
          onToggle={(event) => setSectionOpen('glossary', event.currentTarget.open)}
        >
          <summary>
            <span className="pgi-section-title">{intro.glossaryTitle}</span>
            <span className="pgi-section-sum">Fachbegriffe in einem Satz.</span>
          </summary>
          <dl className="pgi-terms">
            {intro.glossary.map((entry) => (
              <div key={entry.term}>
                <dt>{entry.term}</dt>
                <dd>{entry.text}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </div>
  )
}
