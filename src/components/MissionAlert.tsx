import { commanderSignalSummary } from '../lib/commanderLanguage'
import { signalEffectLabel, signalEffectState } from '../lib/signalEffects'
import type { Signal } from '../types/canopy'
import type { PlaybackStatus } from '../types/playback'

type MissionAlertProps = {
  playback: PlaybackStatus | null
  signal: Signal | null
}

const formatDuration = (milliseconds: number) => {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) {
    return `${hours}H ${minutes.toString().padStart(2, '0')}M`
  }

  return `${minutes}M`
}

export function MissionAlert({ playback, signal }: MissionAlertProps) {
  if (!signal) {
    return null
  }

  const summary = commanderSignalSummary(signal)
  const state = signalEffectState(signal)
  const location = signal.location.label ?? signal.payload.asset ?? signal.source

  return (
    <aside
      className={`mission-alert mission-alert--${state}`}
      key={signal.id}
      aria-live="polite"
    >
      <div>
        <span>{signalEffectLabel(signal)}</span>
        <strong>{summary.oneLine}</strong>
      </div>
      <p>{location}</p>
      <footer className="mission-alert__telemetry">
        <b>{playback ? `MET ${formatDuration(playback.elapsedMs)}` : 'LIVE'}</b>
        <i>{signal.domain.toUpperCase()}</i>
        <i>{Math.round(signal.confidence * 100)}% CONF</i>
      </footer>
    </aside>
  )
}
