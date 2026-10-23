'use client';

export type Tile = {
  label: string;
  hint: string;
  value: number | string;
  /** Status colour token; zero counts fall back to the muted cancelled tone. */
  status: string;
  /** Filter this tile toggles; tiles without one are read-only. */
  focus?: string;
  active?: boolean;
};
/** The dashboard's summary row, reused so both pages read the same way. */
export default function SummaryTiles({tiles, onToggle}: {tiles: Tile[]; onToggle: (tile: Tile) => void}) {
  return (
    <section className="attention" aria-label="Summary">
      <div className="attention-grid">
        {tiles.map(t => {
          const status = t.value === 0 ? 'cancelled' : t.status;
          return t.focus ? (
            <button
              key={t.label}
              className="attention-item"
              data-status={status}
              aria-pressed={!!t.active}
              onClick={() => onToggle(t)}
            >
              <strong>{t.value}</strong>
              <span>{t.label}</span>
              <small>{t.hint}</small>
            </button>
          ) : (
            <div key={t.label} className="attention-item" data-status={status}>
              <strong>{t.value}</strong>
              <span>{t.label}</span>
              <small>{t.hint}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
