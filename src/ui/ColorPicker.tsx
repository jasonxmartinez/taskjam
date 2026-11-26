import { PROJECT_COLORS } from "../model/types";

export function ColorDot({ color, className = "" }: { color: string; className?: string }) {
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`} style={{ backgroundColor: color }} />;
}

/** A row of project color swatches. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Project color">
      {PROJECT_COLORS.map((c) => {
        const selected = c.value.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={c.name}
            aria-label={c.name}
            onMouseDown={(e) => e.preventDefault() /* keep focus in a name field */}
            onClick={() => onChange(c.value)}
            className={`h-5 w-5 rounded-full ring-offset-2 ring-offset-surface-raised ${selected ? "ring-2 ring-ink" : "hover:ring-2 hover:ring-line"}`}
            style={{ backgroundColor: c.value }}
          />
        );
      })}
    </div>
  );
}
