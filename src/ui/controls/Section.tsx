import { useId, type ReactNode } from 'react';
import { de } from '../i18n/de';
import { useUi } from '../uiState';

interface SectionProps {
  /** Key for the remembered open / closed state. */
  id: string;
  title: string;
  /** Shown beside the title while the section is closed. */
  summary?: string;
  children: ReactNode;
}

/** A group of parameters whose title opens and closes it. */
export function Section({ id, title, summary, children }: SectionProps) {
  const open = useUi((s) => !s.collapsed[id]);
  const toggle = useUi((s) => s.toggleSection);
  const body = useId();
  return (
    <fieldset className={open ? 'section' : 'section closed'}>
      <legend>
        <button
          type="button"
          className="section-toggle"
          aria-expanded={open}
          aria-controls={body}
          aria-label={de.sectionToggle(title, open)}
          onClick={() => toggle(id)}
        >
          <svg className="section-chevron" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4 2.5 7.5 6 4 9.5" />
          </svg>
          <span className="section-title">{title}</span>
          {!open && summary && <span className="section-summary">{summary}</span>}
        </button>
      </legend>
      {open && (
        <div id={body} className="section-body">
          {children}
        </div>
      )}
    </fieldset>
  );
}
