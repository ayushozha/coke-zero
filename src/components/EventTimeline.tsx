import { useEventStore } from "../store/eventStore";
import { EventCard } from "./EventCard";

interface Props {
  onSelect?: (id: string) => void;
}

export function EventTimeline({ onSelect }: Props) {
  const uiEvents = useEventStore((s) => s.uiEvents);
  const selectEvent = useEventStore((s) => s.selectEvent);

  return (
    <div className="app-side">
      <div className="timeline-header">
        <span>Event timeline</span>
        <span>{uiEvents.length} events</span>
      </div>
      <div className="timeline-list">
        {uiEvents.length === 0 ? (
          <div className="timeline-empty">
            Waiting for engine events.
            <br />
            Start a scenario from the bar below.
          </div>
        ) : (
          uiEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onClick={() => {
                selectEvent(event.id);
                onSelect?.(event.id);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
