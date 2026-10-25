import './layers.css';
import '@lobehub/ui/theme.css';
import '../shared/fonts.css';
import { createRoot } from 'react-dom/client';
import { HTML_LANG, type Locale } from '../shared/locale';
import { useSystemTheme } from './hooks/useSystemTheme';
import { i18n } from './i18n';
import { PreviewLayout } from './layouts/PreviewLayout';
import { parseRoute } from './lib/route';

document.documentElement.lang = HTML_LANG[i18n.language as Locale];

function Preview() {
  useSystemTheme();
  const route = parseRoute(location.pathname);
  if (route.kind === 'preview') return <PreviewLayout type={route.type} id={document.documentElement.dataset.ryugiArtifactId ?? route.id} />;
  return <div className="artifact-preview-message">{i18n.t('preview.unavailable')}</div>;
}

createRoot(document.getElementById('root')!).render(<Preview />);
