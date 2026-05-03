import { useState } from 'react'
import type { ReactNode } from 'react'

interface Props {
  /** Visible header label. Click toggles open / closed. */
  title: string
  /** Optional right-aligned text in the summary (e.g. live count). */
  badge?: ReactNode
  /** Open by default (true) or collapsed (false). */
  defaultOpen?: boolean
  /** When true the section claims any leftover vertical space in the
   *  decision stack (flex-grow). One section per stack, typically the
   *  primary reasoning surface. */
  flexGrow?: boolean
  children: ReactNode
}

/** Foldable wrapper around a decision-stack panel. Renders its own
 *  clickable summary above the wrapped child; when collapsed, only the
 *  summary is visible so the operator can compress the column without
 *  losing the section labels.
 */
export function CollapsibleStackSection({
  title,
  badge,
  defaultOpen = true,
  flexGrow = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const classes = ['stack-section']
  if (!open) classes.push('stack-section--collapsed')
  if (flexGrow && open) classes.push('stack-section--grow')
  return (
    <section className={classes.join(' ')}>
      <button
        type="button"
        className="stack-section__summary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="stack-section__chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="stack-section__title">{title}</span>
        {badge ? <span className="stack-section__badge">{badge}</span> : null}
      </button>
      {open ? (
        <div className="stack-section__body">{children}</div>
      ) : null}
    </section>
  )
}
