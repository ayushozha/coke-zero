import { useEventStore } from "../store/eventStore";
import type { UIEvent } from "../types/canopy";

interface Props {
  event: UIEvent;
  onClick?: () => void;
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

export function EventCard({ event, onClick }: Props) {
  const selectedId = useEventStore((s) => s.selectedEventId);
  const setPending = useEventStore((s) => s.dismissApproval);

  const showApprove = event.recommendation && event.type === "recommendation_created";
  const isSelected = selectedId === event.id;

  return (
    <div
      className={`event-card sev-${event.severity}${
        isSelected ? " event-card--selected" : ""
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="event-card__top">
        <span className="event-card__severity">{event.severity}</span>
        {event.demoBeat ? (
          <span className="event-card__beat">Phase {event.demoBeat}</span>
        ) : null}
        <span className="event-card__time">{formatTime(event.timestamp)}</span>
      </div>
      <div className="event-card__title">{event.title}</div>
      <div className="event-card__message">{event.message}</div>
      {showApprove ? (
        <button
          type="button"
          className="event-card__cta"
          onClick={(e) => {
            e.stopPropagation();
            // Re-pop the approve banner if it was dismissed but not approved
            useEventStore.setState({ pendingApproval: event });
            // Suppress the unused import warning — keep the import for future use
            void setPending;
          }}
        >
          {event.recommendation?.approveLabel ?? "APPROVE"}
        </button>
      ) : null}
    </div>
  );
}
