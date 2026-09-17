import type { Island, TripSegment } from "./types";

export default function IslandTabs({
  segments,
  selected,
  onSelect,
}: {
  segments: TripSegment[];
  selected: Island;
  onSelect: (island: Island) => void;
}) {
  return (
    <div className="island-tabs">
      {segments.map((seg) => (
        <button
          key={seg.island}
          type="button"
          className={"island-tab" + (seg.island === selected ? " active" : "")}
          onClick={() => onSelect(seg.island)}
        >
          {seg.islandLabel}
        </button>
      ))}
    </div>
  );
}
