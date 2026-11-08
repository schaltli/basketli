import { SIDES, type Side, type Sides } from '../../geometry/params';
import { de } from '../i18n/de';

interface SideChoiceProps {
  /** Group label, e.g. "Griffe an". */
  label: string;
  value: Sides;
  onChange: (side: Side, on: boolean) => void;
  hint?: string;
}

/** One checkbox per wall: vorne, hinten, links, rechts. */
export function SideChoice({ label, value, onChange, hint }: SideChoiceProps) {
  return (
    <div className="field">
      <div className="side-choice" role="group" aria-label={label}>
        <span className="side-choice-label">{label}</span>
        {SIDES.map((side) => (
          <label key={side} className={value[side] ? 'side-chip on' : 'side-chip'}>
            <input
              type="checkbox"
              checked={value[side]}
              onChange={(e) => onChange(side, e.target.checked)}
            />
            {de.side[side]}
          </label>
        ))}
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
