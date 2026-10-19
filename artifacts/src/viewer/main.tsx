import './layers.css';
import '@lobehub/ui/theme.css';
import '@lobehub/ui/style.css';

import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Shell } from './Shell';
import { useSystemTheme } from './hooks/useSystemTheme';

function Root() {
  useSystemTheme();
  return (
    <ConfigProvider motion={motion} enableCustomFonts={false}>
      <Shell />
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
