import { useId, useRef, useState } from 'react';

interface DimensionLabelProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

const parse = (text: string): number | undefined => {
  const n = Number(text.replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) ? n : undefined;
};

/**
 * Dimension shown on the model. A click opens a small editor: the text field
 * applies on Enter, the slider applies while dragging, Esc restores the value
 * the editor was opened with. Leaving the editor applies the typed value.
 */
export function DimensionLabel({ label, value, min, max, step, onChange }: DimensionLabelProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const initial = useRef(value);
  const slid = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const start = () => {
    initial.current = value;
    slid.current = false;
    setDraft(String(value));
    setOpen(true);
  };
  const commit = () => {
    const n = parse(draft);
    if (n !== undefined && n !== value) onChange(n);
    setOpen(false);
  };
  const cancel = () => {
    if (slid.current) onChange(initial.current);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        className="dim-label"
        aria-label={`${label} ${value} mm`}
        title={label}
        onClick={start}
      >
        {value} <span className="dim-unit">mm</span>
      </button>
    );
  }

  return (
    <div
      ref={box}
      className="dim-editor"
      onBlur={(e) => {
        // Moving between the text field and the slider keeps the editor open.
        if (!box.current?.contains(e.relatedTarget as Node | null)) commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          cancel();
        }
      }}
    >
      <label htmlFor={id} className="dim-editor-label">
        {label}
      </label>
      <div className="dim-editor-row">
        <input
          id={id}
          className="field-number"
          type="text"
          inputMode="decimal"
          autoFocus
          onFocus={(e) => e.target.select()}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        <span className="field-unit">mm</span>
      </div>
      <input
        className="field-range"
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          slid.current = true;
          setDraft(String(n));
          onChange(n);
        }}
      />
    </div>
  );
}
