export type Domain =
  | 'rf_ew'
  | 'cyber'
  | 'osint'
  | 'humint'
  | 'sda'
  | 'pnt'
  | 'satcom'
  | 'drone'

export type Severity = 'low' | 'med' | 'high'

export type Authority = 'local' | 'request'

export type Signal = {
  id: string
  ts: string
  domain: Domain
  source: string
  payload: Record<string, unknown>
  confidence: number
}

export type Anomaly = {
  id: string
  ts: string
  signal_ids: string[]
  pattern: string
  severity: Severity
  summary: string
}

export type Attribution = {
  id: string
  ts: string
  anomaly_ids: string[]
  actor: string
  confidence: number
  doctrine_match: string
  evidence: string[]
  predicted_next: string
  kb_citations: string[]
}

export type Decision = {
  id: string
  ts: string
  attribution_id: string
  action: string
  target: string
  rationale: string
  authority: Authority
  request_packet: Record<string, unknown> | null
}

export type CanopyMessage =
  | { type: 'signal'; data: Signal }
  | { type: 'anomaly'; data: Anomaly }
  | { type: 'attribution'; data: Attribution }
  | { type: 'decision'; data: Decision }

export type CanopySocketState = {
  signals: Signal[]
  anomalies: Anomaly[]
  attributions: Attribution[]
  decisions: Decision[]
  isConnected: boolean
  lastError: string | null
}
