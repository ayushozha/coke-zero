import { useEffect, useState } from "react";
import { listScenarios, triggerReplay } from "../hooks/useEngineSocket";
import { useEventStore } from "../store/eventStore";

// Curated subset shown as friendly buttons. Anything else lives in the
// "More" dropdown.
const FEATURED: { name: string; label: string; accent?: boolean }[] = [
  { name: "beat1.jsonl", label: "Beat 1" },
  { name: "beat2.jsonl", label: "Beat 2" },
  { name: "beat4.jsonl", label: "Beat 4" },
  { name: "beat47.jsonl", label: "Beat 4.7", accent: true },
  { name: "army_multidomain_attack_chain.jsonl", label: "Army · Attack chain" },
  { name: "iran_counter_c5isr_brigade.jsonl", label: "Iran · C5ISR" },
];

export function ScenarioControls() {
  const [available, setAvailable] = useState<string[]>([]);
  const reset = useEventStore((s) => s.reset);

  useEffect(() => {
    let mounted = true;
    void listScenarios().then((list) => {
      if (mounted) setAvailable(list);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const replay = (name: string) => {
    void triggerReplay(name);
  };

  const moreScenarios = available.filter(
    (name) => !FEATURED.some((f) => f.name === name),
  );

  return (
    <div className="scenario-controls">
      <span className="scenario-controls__label">Replay</span>
      {FEATURED.map(({ name, label, accent }) => {
        const isAvailable = available.includes(name);
        return (
          <button
            key={name}
            type="button"
            className={
              accent
                ? "scenario-controls__btn scenario-controls__btn--accent"
                : "scenario-controls__btn"
            }
            disabled={!isAvailable}
            title={isAvailable ? `Replay ${name}` : `${name} not available`}
            onClick={() => replay(name)}
          >
            {label}
          </button>
        );
      })}
      {moreScenarios.length > 0 ? (
        <select
          className="scenario-controls__btn"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              replay(e.target.value);
              e.currentTarget.value = "";
            }
          }}
        >
          <option value="">More…</option>
          {moreScenarios.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        className="scenario-controls__btn"
        onClick={reset}
        title="Clear the timeline and map"
      >
        Reset
      </button>
    </div>
  );
}
