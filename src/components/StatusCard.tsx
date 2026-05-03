export type StatusState = 'white' | 'amber' | 'red'

type StatusCardProps = {
  title: string
  label: string
  state: StatusState
  metric: string
  detail: string
}

export function StatusCard({
  title,
  label,
  state,
  metric,
  detail,
}: StatusCardProps) {
  return (
    <article className={`status-card status-card--${state}`}>
      <div className="status-card__topline">
        <span className="status-card__label">{label}</span>
        <span className="status-card__state">
          <span className="status-card__lamp" aria-hidden="true" />
          {state.toUpperCase()}
        </span>
      </div>
      <h2>{title}</h2>
      <p className="status-card__metric">{metric}</p>
      <p className="status-card__detail">{detail}</p>
    </article>
  )
}
