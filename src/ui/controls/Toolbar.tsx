import { useBasket } from '../../state/store';
import { de } from '../i18n/de';
import { useUi } from '../uiState';
import { DownloadButton } from './DownloadButton';

interface ToolbarProps {
  paramsOpen: boolean;
  onToggleParams: () => void;
}

export function Toolbar({ paramsOpen, onToggleParams }: ToolbarProps) {
  const params = useBasket((s) => s.params);
  const gridMode = useUi((s) => s.gridMode);
  const setGridMode = useUi((s) => s.setGridMode);
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
        <button
          type="button"
          className={gridMode ? 'toggle on' : 'toggle'}
          aria-pressed={gridMode}
          onClick={() => setGridMode(!gridMode)}
        >
          {de.gridButton}
        </button>
      </nav>
      <DownloadButton params={params} />
    </header>
  );
}
