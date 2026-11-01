import { useBasket } from '../../state/store';
import { de } from '../i18n/de';
import { DownloadButton } from './DownloadButton';

interface ToolbarProps {
  paramsOpen: boolean;
  onToggleParams: () => void;
}

export function Toolbar({ paramsOpen, onToggleParams }: ToolbarProps) {
  const params = useBasket((s) => s.params);
  return (
    <header className="app-header">
      <h1>{de.appTitle}</h1>
      <nav className="toolbar">
        <button
          type="button"
          className={paramsOpen ? 'toggle on' : 'toggle'}
          aria-pressed={paramsOpen}
          onClick={onToggleParams}
        >
          {de.paramsButton}
        </button>
      </nav>
      <DownloadButton params={params} />
    </header>
  );
}
