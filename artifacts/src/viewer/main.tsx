import './layers.css';
import '@lobehub/ui/theme.css';
import '@lobehub/ui/style.css';
import '../shared/fonts.css';

import { ConfigProvider, ContextMenuHost, ModalHost, ToastHost } from '@lobehub/ui';
import { motion } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Shell } from './Shell';
import { useSystemTheme } from './hooks/useSystemTheme';
import { i18n } from './i18n';
import { HTML_LANG, type Locale } from '../shared/locale';

document.documentElement.lang = HTML_LANG[i18n.language as Locale];

function Root() {
  useSystemTheme();
  return (
    <ConfigProvider motion={motion} enableCustomFonts={false}>
      <Shell />
      <ModalHost />
      <ToastHost />
      <ContextMenuHost />
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
