import { useEffect, useMemo, useState } from 'react'
import { ApproveBanner } from '../components/ApproveBanner'
import { EventFeed } from '../components/EventFeed'
import { MapStage } from '../components/MapStage'
import { MissionSummary } from '../components/MissionSummary'
import { NarrationPanel } from '../components/NarrationPanel'
import { useCanopySocket } from '../hooks/useCanopySocket'
import type { Attribution, Decision, Signal } from '../types/canopy'

const nowMinus = (seconds: number) =>
  new Date(Date.now() - seconds * 1000).toISOString()

const beatSignals: Signal[] = [
  {
    id: 'sig-rf-001',
    ts: nowMinus(26),
    domain: 'rf_ew',
    source: 'EW-17 spectrum sweep',
    payload: { band: 'L', bearing: '041', emitter: 'burst uplink' },
    confidence: 0.82,
  },
  {
    id: 'sig-cy-014',
    ts: nowMinus(21),
    domain: 'cyber',
    source: 'Tactical gateway IDS',
    payload: { vector: 'credential replay', node: 'BLOS relay east' },
    confidence: 0.77,
  },
  {
    id: 'sig-sda-042',
    ts: nowMinus(16),
    domain: 'sda',
    source: 'LEO custody track',
    payload: { object: 'RSO-8841', maneuver: 'proximity drift' },
    confidence: 0.91,
  },
  {
    id: 'sig-pnt-011',
    ts: nowMinus(10),
    domain: 'pnt',
    source: 'Blue PNT mesh',
    payload: { error: '42m', trend: 'widening', sector: 'north axis' },
    confidence: 0.74,
  },
  {
    id: 'sig-sat-023',
    ts: nowMinus(4),
    domain: 'satcom',
    source: 'BLOS waveform monitor',
    payload: { link: 'SAT-BRAVO', noise: '+18db', status: 'degrading' },
    confidence: 0.88,
  },
  {
    id: 'sig-os-108',
    ts: nowMinus(2),
    domain: 'osint',
    source: 'Regional language scrape',
    payload: { phrase: 'window opens', channel: 'gray forum' },
    confidence: 0.69,
  },
]

const beatAttribution: Attribution = {
  id: 'att-ghost-lance',
  ts: nowMinus(1),
  anomaly_ids: ['ano-cross-domain-07'],
  actor: 'Ghost Lance cell',
  confidence: 0.84,
  doctrine_match: 'counter-C2 isolation before fires window',
  evidence: [
    'RF burst timing matches known pre-jam rehearsal pattern',
    'Credential replay is focused on the same BLOS relay under noise',
    'SDA custody shift aligns with PNT error widening on the north axis',
  ],
  predicted_next: 'open a 9 minute BLOS denial window',
  kb_citations: ['KB-17-044', 'KB-21-119'],
}

const beatDecision: Decision = {
  id: 'dec-approve-009',
  ts: nowMinus(0),
  attribution_id: 'att-ghost-lance',
  action: 'Authorize SATCOM hardening package',
  target: 'SAT-BRAVO / north-axis BLOS relay',
  rationale:
    'Preemptive waveform shift and relay isolation are expected to preserve command links during the predicted denial window.',
  authority: 'request',
  request_packet: {
    packet_id: 'REQ-SAT-BRAVO-009',
    ttl_minutes: 6,
    commander_intent: 'preserve brigade C2',
  },
}

export function Brigade() {
  const socketState = useCanopySocket()
  const [beatIndex, setBeatIndex] = useState(1)
  const [isApproved, setIsApproved] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setBeatIndex((current) => (current % beatSignals.length) + 1)
    }, 1500)

    return () => window.clearInterval(timer)
  }, [])

  const mockSignals = useMemo(
    () =>
      beatSignals
        .slice(0, beatIndex)
        .map((signal, index) => ({
          ...signal,
          ts: nowMinus((beatIndex - index) * 4),
        }))
        .reverse(),
    [beatIndex],
  )

  const signals = socketState.signals.length ? socketState.signals : mockSignals
  const latestAttribution =
    socketState.attributions[0] ?? (beatIndex >= 4 ? beatAttribution : null)
  const latestDecision =
    socketState.decisions[0] ?? (beatIndex >= 5 ? beatDecision : null)

  return (
    <main className="brigade-shell">
      <header className="app-header">
        <div>
          <p className="app-header__eyebrow">CANOPY / Brigade</p>
          <h1>Multi-Domain Fusion Dashboard</h1>
        </div>
        <div className="app-header__right">
          <span
            className={
              socketState.isConnected
                ? 'socket-status socket-status--online'
                : 'socket-status'
            }
          >
            {socketState.isConnected ? 'socket live' : 'mock beat'}
          </span>
          <a href="/operator">Operator View</a>
        </div>
      </header>

      <MissionSummary
        attribution={latestAttribution}
        decision={latestDecision}
        signalCount={signals.length}
      />

      <section className="command-layout">
        <MapStage />
        <div className="command-layout__side">
          <NarrationPanel attribution={latestAttribution} />
          <ApproveBanner
            decision={latestDecision}
            isApproved={isApproved}
            onApprove={() => setIsApproved(true)}
          />
        </div>
      </section>

      <EventFeed signals={signals} />
    </main>
  )
}
