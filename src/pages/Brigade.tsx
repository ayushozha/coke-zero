import { useEffect, useRef, useState } from 'react'
import { ApproveBanner } from '../components/ApproveBanner'
import { EventFeed } from '../components/EventFeed'
import { MapStage } from '../components/MapStage'
import { MissionSummary } from '../components/MissionSummary'
import { ScenarioRail } from '../components/ScenarioRail'
import { useCanopyMissionState } from '../hooks/useCanopyMissionState'
import { useCanopySocket } from '../hooks/useCanopySocket'
import type { Attribution, Decision, Signal } from '../types/canopy'

const nowMinus = (seconds: number) =>
  new Date(Date.now() - seconds * 1000).toISOString()

type MockSignalInput = Omit<
  Signal,
  'realism' | 'location' | 'payload' | 'provenance'
> & {
  location?: Signal['location']
  payload: Record<string, unknown>
}

type DemoSignalTemplate = Omit<MockSignalInput, 'id' | 'ts' | 'confidence'> & {
  confidence: [number, number]
  cadence?: 'normal' | 'surge'
}

const makeBeatSignal = (signal: MockSignalInput): Signal => ({
  ...signal,
  realism: 'mock_operational',
  location: signal.location ?? { label: signal.source },
  payload: {
    event_type: signal.domain,
    summary: signal.source,
    ...signal.payload,
  } as Signal['payload'],
  provenance: {
    source_id: 'frontend-mock-beat',
    method: 'ui_fallback',
  },
})

const randomBetween = ([min, max]: [number, number]) =>
  min + Math.random() * (max - min)

const demoConfidenceForSequence = (sequence: number) =>
  sequence % 5 === 0 ? randomBetween([0.86, 0.96]) : randomBetween([0.74, 0.85])

const randomDemoDelay = () => 10000 + Math.floor(Math.random() * 5000)

const jitter = (value: number, amount: number) =>
  Number((value + (Math.random() - 0.5) * amount).toFixed(5))

const beatSignals: Signal[] = [
  makeBeatSignal({
    id: 'sig-rf-001',
    ts: nowMinus(26),
    domain: 'rf_ew',
    source: 'EW-17 spectrum sweep',
    location: { lat: 34.39, lng: 36.32, alt_m: 260, label: 'Route ridgeline' },
    payload: { band: 'L', bearing: '041', emitter: 'burst uplink' },
    confidence: 0.82,
  }),
  makeBeatSignal({
    id: 'sig-cy-014',
    ts: nowMinus(21),
    domain: 'cyber',
    source: 'Tactical gateway IDS',
    location: { lat: 34.51, lng: 36.41, label: 'Brigade C2 gateway' },
    payload: { vector: 'credential replay', node: 'BLOS relay east' },
    confidence: 0.77,
  }),
  makeBeatSignal({
    id: 'sig-sda-042',
    ts: nowMinus(16),
    domain: 'sda',
    source: 'LEO custody track',
    location: { lat: 34.8, lng: 36.8, alt_km: 548, label: 'LEO custody arc' },
    payload: { object: 'RSO-8841', maneuver: 'proximity drift' },
    confidence: 0.91,
  }),
  makeBeatSignal({
    id: 'sig-pnt-011',
    ts: nowMinus(10),
    domain: 'pnt',
    source: 'Blue PNT mesh',
    location: { lat: 34.66, lng: 36.58, alt_m: 285, label: 'PNT drift box' },
    payload: { error: '42m', trend: 'widening', sector: 'north axis' },
    confidence: 0.74,
  }),
  makeBeatSignal({
    id: 'sig-sat-023',
    ts: nowMinus(4),
    domain: 'satcom',
    source: 'BLOS waveform monitor',
    location: { lat: 34.5, lng: 36.4, alt_m: 250, label: 'BLOS relay node' },
    payload: { link: 'SAT-BRAVO', noise: '+18db', status: 'degrading' },
    confidence: 0.88,
  }),
  makeBeatSignal({
    id: 'sig-os-108',
    ts: nowMinus(2),
    domain: 'osint',
    source: 'Regional language scrape',
    location: { lat: 34.6, lng: 36.52, label: 'Brigade operating area' },
    payload: { phrase: 'window opens', channel: 'gray forum' },
    confidence: 0.69,
  }),
]

const demoSignalTemplates: DemoSignalTemplate[] = [
  {
    domain: 'rf_ew',
    source: 'brigade-spectrum-team',
    location: {
      lat: 34.63,
      lng: 36.55,
      alt_m: 310,
      label: 'Forward UAS operating box',
    },
    payload: {
      beat: 'frontend_tail_demo',
      event_type: 'rf_interference',
      asset: 'UAS-LINK-GROUP-B',
      summary: 'EW team detects rising interference against drone C2 links.',
      observables: {
        center_freq_mhz: 1782.1,
        bandwidth_mhz: 4.8,
        bearing_deg: 82,
        affected_assets: ['DRONE-04', 'DRONE-05', 'DRONE-08'],
      },
    },
    confidence: [0.81, 0.91],
    cadence: 'surge',
  },
  {
    domain: 'pnt',
    source: 'gnss-integrity-monitor',
    location: {
      lat: 34.66,
      lng: 36.58,
      alt_m: 285,
      label: 'Forward UAS operating box',
    },
    payload: {
      beat: 'frontend_tail_demo',
      event_type: 'gps_spoof',
      asset: 'UAS-LINK-GROUP-B',
      summary: 'Drones report coherent GPS displacement inconsistent with inertial estimates.',
      observables: {
        affected_assets: ['DRONE-04', 'DRONE-05', 'DRONE-08'],
        delta_meters: 420,
        shared_bias_vector: true,
      },
    },
    confidence: [0.86, 0.95],
    cadence: 'surge',
  },
  {
    domain: 'drone',
    source: 'uas-swarm-controller',
    location: {
      lat: 34.67,
      lng: 36.6,
      alt_m: 300,
      label: 'Forward UAS operating box',
    },
    payload: {
      beat: 'frontend_tail_demo',
      event_type: 'autonomous_relay_handoff',
      asset: 'DRONE-08',
      summary: 'Drone swarm shifts relay path away from spoofed nodes.',
      observables: {
        previous_primary: 'DRONE-04',
        new_primary: 'DRONE-08',
        handoff_success: true,
        new_nav_mode: 'inertial_visual_odometry',
      },
    },
    confidence: [0.88, 0.96],
  },
  {
    domain: 'cyber',
    source: 'brigade-siem',
    location: {
      lat: 34.51,
      lng: 36.41,
      alt_m: 240,
      label: 'Brigade tactical operations node',
    },
    payload: {
      beat: 'frontend_tail_demo',
      event_type: 'credential_probe',
      asset: 'BDE-C2-GATEWAY',
      summary: 'Credential probes target the gateway forwarding drone telemetry.',
      observables: {
        failed_logins_60s: 63,
        target_service: 'telemetry-forwarder',
        overlaps_rf_window: true,
      },
    },
    confidence: [0.72, 0.86],
  },
  {
    domain: 'satcom',
    source: 'brigade-satcom-controller',
    location: {
      lat: 34.5,
      lng: 36.4,
      alt_m: 250,
      label: 'Brigade tactical operations node',
    },
    payload: {
      beat: 'frontend_tail_demo',
      event_type: 'satcom_degradation',
      asset: 'BDE-SATCOM-1',
      summary: 'SATCOM link degrades while relay and PNT anomalies are active.',
      observables: {
        packet_loss_pct: 12.7,
        jitter_ms: 71,
        link_margin_db: 0.7,
        fallback_route: 'DRONE-08-MESH',
      },
    },
    confidence: [0.78, 0.89],
  },
  {
    domain: 'osint',
    source: 'canopy-correlation-engine',
    location: {
      lat: 34.6,
      lng: 36.52,
      label: 'Brigade operating area',
    },
    payload: {
      beat: 'frontend_tail_demo',
      event_type: 'multi_domain_attack_assessment',
      asset: 'CANOPY-MISSION-CELL',
      summary: 'CANOPY assesses coordinated counter-C5ISR pressure against ISR, PNT, SATCOM, and space support.',
      observables: {
        assessment: 'coordinated_counter_c5isr_pressure',
        recommended_response: 'preserve relay, reduce emissions, request space support options',
      },
    },
    confidence: [0.84, 0.92],
  },
  {
    domain: 'sda',
    source: 'leo-custody-track',
    location: {
      lat: 34.8,
      lng: 36.8,
      alt_km: 548,
      label: 'LEO custody arc',
    },
    payload: {
      beat: 'frontend_tail_demo',
      event_type: 'rpo_close_approach',
      asset: 'RSO-8841',
      summary: 'LEO custody track enters close-approach watch box near SATCOM support window.',
      observables: {
        range_km: 146,
        relative_velocity_mps: 42,
        watch_box: 'SATCOM-SUPPORT-WINDOW',
      },
    },
    confidence: [0.8, 0.93],
  },
  {
    domain: 'terrain',
    source: 'cached-aor-terrain',
    location: {
      area_wkt:
        'POLYGON((36.18 34.25,36.34 34.25,36.34 34.39,36.18 34.39,36.18 34.25))',
      label: 'Northern relay corridor',
    },
    payload: {
      beat: 'frontend_tail_demo',
      event_type: 'terrain_masking_risk',
      asset: 'RELAY-CORRIDOR-NORTH',
      summary: 'Terrain model indicates relay is near a line-of-sight masking zone.',
      observables: {
        masking_ridge_m: 612,
        affected_links: ['DRONE-02->FOXTROT-OBS-2'],
        alternate_relay_candidate: 'DRONE-06',
      },
    },
    confidence: [0.74, 0.84],
  },
]

const makeDemoSignal = (sequence: number): Signal => {
  const surgeWindow = sequence % 18 >= 7 && sequence % 18 <= 12
  const surgeTemplates = demoSignalTemplates.filter(
    (template) => template.cadence === 'surge',
  )
  const sourceTemplates = surgeWindow ? surgeTemplates : demoSignalTemplates
  const template =
    sourceTemplates[Math.floor(Math.random() * sourceTemplates.length)] ??
    demoSignalTemplates[0]
  const ts = new Date().toISOString()
  const confidence = Number(demoConfidenceForSequence(sequence).toFixed(2))
  const observables =
    typeof template.payload.observables === 'object' &&
    template.payload.observables !== null
      ? template.payload.observables
      : {}
  const location = {
    ...template.location,
    lat:
      typeof template.location?.lat === 'number'
        ? jitter(template.location.lat, 0.08)
        : template.location?.lat,
    lng:
      typeof template.location?.lng === 'number'
        ? jitter(template.location.lng, 0.08)
        : template.location?.lng,
  }

  return makeBeatSignal({
    ...template,
    id: `demo-tail-${sequence.toString().padStart(4, '0')}`,
    ts,
    confidence,
    location,
    payload: {
      ...template.payload,
      observables: {
        ...observables,
        priority_band: confidence >= 0.86 ? 'critical' : 'amber',
        stream_sequence: sequence,
        surge_window: surgeWindow,
      },
    },
  })
}

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
  source_signal_ids: ['sig-rf-001', 'sig-cy-014', 'sig-sda-042'],
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
  source_signal_ids: ['sig-rf-001', 'sig-sat-023'],
}

export function Brigade() {
  const socketState = useCanopySocket()
  const forceDemoStream = new URLSearchParams(window.location.search).has(
    'demoStream',
  )
  const [beatIndex, setBeatIndex] = useState(1)
  const [demoStream, setDemoStream] = useState<Signal[]>(() =>
    beatSignals.map((signal, index) => ({
      ...signal,
      id: `demo-tail-${index.toString().padStart(4, '0')}`,
      ts: nowMinus((beatSignals.length - index) * 2),
    })),
  )
  const demoSequenceRef = useRef(beatSignals.length)
  const [isMapAutoFocusEnabled, setIsMapAutoFocusEnabled] = useState(false)
  const [isApproved, setIsApproved] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setBeatIndex((current) => (current % beatSignals.length) + 1)
    }, 1500)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (socketState.isConnected && !forceDemoStream) {
      return
    }

    let timer: number

    const scheduleNextSignal = () => {
      timer = window.setTimeout(() => {
        demoSequenceRef.current += 1
        const nextSignal = makeDemoSignal(demoSequenceRef.current)
        setDemoStream((current) => [nextSignal, ...current].slice(0, 50))
        scheduleNextSignal()
      }, randomDemoDelay())
    }

    scheduleNextSignal()

    return () => window.clearTimeout(timer)
  }, [forceDemoStream, socketState.isConnected])

  const isUsingLiveSignals = !forceDemoStream && socketState.signals.length > 0
  const signals = isUsingLiveSignals ? socketState.signals : demoStream
  const dataModeLabel = isUsingLiveSignals
    ? 'Live data'
    : forceDemoStream
      ? 'Demo stream'
      : socketState.isConnected
        ? 'Socket idle'
        : 'Demo data'
  const latestAttribution =
    socketState.attributions[0] ?? (beatIndex >= 4 ? beatAttribution : null)
  const latestDecision =
    socketState.decisions[0] ?? (beatIndex >= 5 ? beatDecision : null)
  const latestUiEvent = socketState.uiEvents[0] ?? null
  const missionState = useCanopyMissionState(signals, socketState.uiEvents, {
    enableMapAutoFocus: isMapAutoFocusEnabled,
    mapFocusMinConfidence: 0.86,
  })

  return (
    <main className="brigade-shell">
      <header className="app-header">
        <div>
          <p className="app-header__eyebrow">CANOPY</p>
          <h1>Brigade COP</h1>
        </div>
        <div className="app-header__right">
          <span
            className={
              isUsingLiveSignals
                ? 'socket-status socket-status--online'
                : 'socket-status'
            }
          >
            {dataModeLabel}
          </span>
          <a href="/operator">Ops</a>
        </div>
      </header>

      <section className="command-workbench">
        <ScenarioRail />

        <section className="map-workspace" aria-label="Map and incoming reports">
          <MapStage
            correlatedSignalIds={missionState.correlatedSignalIds}
            focusSignalId={missionState.mapFocusSignalId}
            signals={signals}
          />

          <EventFeed
            isLive={isUsingLiveSignals}
            isMapAutoFocusEnabled={isMapAutoFocusEnabled}
            onToggleMapAutoFocus={() =>
              setIsMapAutoFocusEnabled((isEnabled) => !isEnabled)
            }
            signals={signals}
          />
        </section>

        <aside className="decision-stack" aria-label="Commander decision stack">
          <MissionSummary
            attribution={latestAttribution}
            decision={latestDecision}
            uiEvent={latestUiEvent}
            signalCount={signals.length}
          />
          <ApproveBanner
            decision={latestDecision}
            uiEvent={latestUiEvent}
            isApproved={isApproved}
            onApprove={() => setIsApproved(true)}
          />
        </aside>
      </section>
    </main>
  )
}
