import type { Decision } from '../types/coke_zero'

type RequestPacketSummaryProps = {
  compact?: boolean
  packet: Decision['request_packet']
}

type PacketRow = {
  label: string
  value: string
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const asNumber = (value: unknown): number | null => {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const formatNumber = (value: number, fractionDigits = 1) => {
  const formatted = value.toFixed(fractionDigits)
  return formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted
}

const formatLead = (seconds: number) => {
  if (seconds >= 3600) {
    return `${formatNumber(seconds / 3600, 1)} h`
  }
  if (seconds >= 60) {
    return `${formatNumber(seconds / 60, 1)} min`
  }
  return `${formatNumber(seconds, 0)} sec`
}

const addRow = (rows: PacketRow[], label: string, value: unknown) => {
  const text = asText(value)
  if (text) rows.push({ label, value: text })
}

export function RequestPacketSummary({
  compact = false,
  packet,
}: RequestPacketSummaryProps) {
  if (!packet || Object.keys(packet).length === 0) {
    return (
      <div className="request-packet request-packet--empty">
        No request packet attached
      </div>
    )
  }

  const rows: PacketRow[] = []
  const burn = asRecord(packet.recommended_burn)
  const preMissKm = asNumber(packet.pre_miss_km)
  const postMissKm = asNumber(packet.post_miss_km)
  const handledKeys = new Set([
    'commander_intent',
    'id',
    'packet_id',
    'post_miss_km',
    'pre_miss_km',
    'recommended_burn',
    'to',
    'ttl_minutes',
  ])

  addRow(rows, 'To', packet.to)
  addRow(rows, 'Packet', packet.packet_id ?? packet.id)
  addRow(rows, 'Intent', packet.commander_intent)
  addRow(rows, 'TTL', packet.ttl_minutes ? `${packet.ttl_minutes} min` : null)

  if (preMissKm !== null && postMissKm !== null) {
    rows.push({
      label: 'Miss distance',
      value: `${formatNumber(preMissKm)} -> ${formatNumber(postMissKm)} km`,
    })
  }

  if (burn) {
    addRow(rows, 'Maneuver', [burn.sat, burn.against].filter(Boolean).join(' vs '))
    const dv = asNumber(burn.dv_m_s)
    if (dv !== null) {
      rows.push({ label: 'Delta-v', value: `${formatNumber(dv, 2)} m/s` })
    }
    addRow(rows, 'Burn time', burn.t_burn_utc)
    const leadSeconds = asNumber(burn.lead_seconds)
    if (leadSeconds !== null) {
      rows.push({ label: 'Planning lead', value: formatLead(leadSeconds) })
    }
    const actualLeadSeconds = asNumber(burn.actual_lead_seconds)
    if (actualLeadSeconds !== null) {
      rows.push({
        label: 'Scenario lead',
        value: formatLead(actualLeadSeconds),
      })
    }
  }

  Object.entries(packet)
    .filter(
      ([key, value]) =>
        !handledKeys.has(key) && value !== null && value !== undefined,
    )
    .filter(([, value]) => typeof value !== 'object')
    .slice(0, compact ? 2 : 6)
    .forEach(([key, value]) => addRow(rows, key.replaceAll('_', ' '), value))

  const packetName =
    asText(packet.packet_id) ?? asText(packet.to) ?? 'authority envelope'

  return (
    <section
      className={`request-packet${compact ? ' request-packet--compact' : ''}`}
      aria-label="Request packet"
    >
      <div className="request-packet__head">
        <span>Request packet</span>
        <strong>{packetName}</strong>
      </div>
      <dl className="request-packet__rows">
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
