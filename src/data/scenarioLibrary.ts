import armyDroneFdirRaw from '../../scenarios/army_drone_fdir.jsonl?raw'
import armyChainRaw from '../../scenarios/army_multidomain_attack_chain.jsonl?raw'
import armyRelayRaw from '../../scenarios/army_relay_reconfig.jsonl?raw'
import armySpaceRaw from '../../scenarios/army_satellite_collection_risk.jsonl?raw'
import beat1Raw from '../../scenarios/beat1.jsonl?raw'
import beat2Raw from '../../scenarios/beat2.jsonl?raw'
import beat4Raw from '../../scenarios/beat4.jsonl?raw'
import beat47Raw from '../../scenarios/beat47.jsonl?raw'
import iranC5isrRaw from '../../scenarios/iran_counter_c5isr_brigade.jsonl?raw'
import iranHormuzRaw from '../../scenarios/iran_hormuz_convoy_resilience.jsonl?raw'
import iranProxyRaw from '../../scenarios/iran_proxy_uas_base_defense.jsonl?raw'
import type { Domain, Signal } from '../types/coke_zero'

export type ScenarioDefinition = {
  id: string
  name: string
  shortName: string
  family: 'iran' | 'regional' | 'army'
  file: string
  theater: string
  objective: string
  domains: Domain[]
  signals: Signal[]
}

type ScenarioSeed = Omit<ScenarioDefinition, 'signals'>

const parseSignals = (raw: string) =>
  raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Signal)

const scenarioSeeds: Array<ScenarioSeed & { raw: string }> = [
  {
    id: '01',
    name: 'Iran counter-C5ISR brigade',
    shortName: 'Counter-C5ISR',
    family: 'iran',
    file: 'iran_counter_c5isr_brigade.jsonl',
    theater: 'CENTCOM / Iraq',
    objective: 'Preserve brigade C2, PNT, SATCOM, and ISR custody.',
    domains: ['osint', 'sda', 'rf_ew', 'pnt', 'drone', 'satcom', 'cyber', 'orbit'],
    raw: iranC5isrRaw,
  },
  {
    id: '02',
    name: 'Hormuz convoy resilience',
    shortName: 'Hormuz convoy',
    family: 'iran',
    file: 'iran_hormuz_convoy_resilience.jsonl',
    theater: 'Strait of Hormuz',
    objective: 'Hold or release logistics movement under degraded space support.',
    domains: ['osint', 'sda', 'rf_ew', 'pnt', 'drone', 'satcom', 'orbit'],
    raw: iranHormuzRaw,
  },
  {
    id: '03',
    name: 'Proxy UAS base defense',
    shortName: 'Base defense',
    family: 'iran',
    file: 'iran_proxy_uas_base_defense.jsonl',
    theater: 'Western Iraq',
    objective: 'Preserve overhead warning and local C-UAS custody.',
    domains: ['osint', 'sda', 'rf_ew', 'pnt', 'satcom', 'cyber', 'drone'],
    raw: iranProxyRaw,
  },
  {
    id: '04',
    name: 'Army drone FDIR',
    shortName: 'Drone FDIR',
    family: 'army',
    file: 'army_drone_fdir.jsonl',
    theater: 'Route Hammer',
    objective: 'Separate spoofing from platform failure and keep ISR moving.',
    domains: ['drone', 'pnt', 'rf_ew', 'osint'],
    raw: armyDroneFdirRaw,
  },
  {
    id: '05',
    name: 'Army relay reconfiguration',
    shortName: 'Relay reconfig',
    family: 'army',
    file: 'army_relay_reconfig.jsonl',
    theater: 'Northern relay corridor',
    objective: 'Maintain observer connectivity through SATCOM and terrain masking.',
    domains: ['drone', 'satcom', 'terrain', 'osint'],
    raw: armyRelayRaw,
  },
  {
    id: '06',
    name: 'Satellite collection risk',
    shortName: 'Collection risk',
    family: 'army',
    file: 'army_satellite_collection_risk.jsonl',
    theater: 'Brigade support area',
    objective: 'Protect logistics movement during overhead collection windows.',
    domains: ['sda', 'orbit', 'humint', 'osint', 'rf_ew'],
    raw: armySpaceRaw,
  },
  {
    id: '07',
    name: 'Army multidomain attack chain',
    shortName: 'Attack chain',
    family: 'army',
    file: 'army_multidomain_attack_chain.jsonl',
    theater: 'Division support area',
    objective: 'Recognize coordinated pressure across space, EW, PNT, cyber, and SATCOM.',
    domains: ['orbit', 'rf_ew', 'pnt', 'drone', 'cyber', 'satcom', 'osint'],
    raw: armyChainRaw,
  },
  {
    id: '08',
    name: 'Western Pacific orbit cue',
    shortName: 'Orbit cue',
    family: 'regional',
    file: 'beat1.jsonl',
    theater: 'Western Pacific',
    objective: 'Fuse orbital custody, OSINT, and cyber context into a commander cue.',
    domains: ['orbit', 'osint', 'cyber'],
    raw: beat1Raw,
  },
  {
    id: '09',
    name: 'Guam EW and PNT pressure',
    shortName: 'Guam EW/PNT',
    family: 'regional',
    file: 'beat2.jsonl',
    theater: 'Guam approach',
    objective: 'Track EW, cyber, PNT, and drone continuity around a gateway.',
    domains: ['rf_ew', 'cyber', 'pnt', 'drone'],
    raw: beat2Raw,
  },
  {
    id: '10',
    name: 'Western Pacific operating area',
    shortName: 'Pacific AOR',
    family: 'regional',
    file: 'beat4.jsonl',
    theater: 'Western Pacific',
    objective: 'Show cross-domain operating-area convergence for brigade staff.',
    domains: ['osint', 'orbit', 'pnt', 'cyber'],
    raw: beat4Raw,
  },
  {
    id: '11',
    name: 'Guam SATCOM gateway',
    shortName: 'SATCOM gateway',
    family: 'regional',
    file: 'beat47.jsonl',
    theater: 'Guam gateway',
    objective: 'Expose SATCOM, orbit, RF, and OSINT pressure on a key gateway.',
    domains: ['satcom', 'orbit', 'rf_ew', 'osint'],
    raw: beat47Raw,
  },
]

export const scenarios: ScenarioDefinition[] = scenarioSeeds.map(
  ({ raw, ...scenario }) => ({
    ...scenario,
    signals: parseSignals(raw),
  }),
)

export const defaultScenario = scenarios[0]
