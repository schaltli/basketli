import { useId, useState } from 'react';

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

/**
 * Number input with its slider beside it. The slider applies immediately; the text field
 * applies on Enter or when it loses focus (Esc restores the current value).
 * While nobody is typing, the field simply shows the current value.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = 'mm',
  onChange,
}: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft !== null) {
      const n = Number(draft.replace(',', '.'));
      if (draft.trim() !== '' && Number.isFinite(n) && n !== value) onChange(n);
    }
    setDraft(null);
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-row">
        <input
          id={id}
          className="field-number"
          type="text"
          inputMode="decimal"
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(null);
              e.stopPropagation();
            }
          }}
        />
        <span className="field-unit">{unit}</span>
        <input
          className="field-range"
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
