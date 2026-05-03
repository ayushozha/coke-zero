import { useEventStore } from "../store/eventStore";

const LABELS: Record<string, string> = {
  connecting: "connecting",
  live: "live · ws",
  fixture: "fixture",
  offline: "offline",
};

export function ConnectionStatus() {
  const status = useEventStore((s) => s.connection);
  return (
    <div className={`connection-status connection-status--${status}`}>
      <span className="connection-status__dot" />
      <span>{LABELS[status] ?? status}</span>
    </div>
  );
}
