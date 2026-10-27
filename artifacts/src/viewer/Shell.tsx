import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { t } from './i18n';
import { parseRoute } from './lib/route';

const AutoPublishBar = lazy(() =>
  import('./components/AutoPublishPrompt').then(({ AutoPublishBar }) => ({
    default: AutoPublishBar,
  })),
);
const ArtboardLayout = lazy(() =>
  import('./layouts/ArtboardLayout').then(({ ArtboardLayout }) => ({ default: ArtboardLayout })),
);
const ArtifactList = lazy(() =>
  import('./layouts/ArtifactList').then(({ ArtifactList }) => ({ default: ArtifactList })),
);
const DocumentLayout = lazy(() =>
  import('./layouts/DocumentLayout').then(({ DocumentLayout }) => ({ default: DocumentLayout })),
);
const HtmlLayout = lazy(() =>
  import('./layouts/HtmlLayout').then(({ HtmlLayout }) => ({ default: HtmlLayout })),
);
const PreviewLayout = lazy(() =>
  import('./layouts/PreviewLayout').then(({ PreviewLayout }) => ({ default: PreviewLayout })),
);

const styles = stylex.create({
  unknown: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 24,
    color: cssVar.colorTextSecondary,
    fontFamily: cssVar.fontFamily,
    fontSize: 14,
  },
});

const local = (page: ReactNode) => (
  <>
    {page}
    <AutoPublishBar />
  </>
);

function RouteView() {
  const [path] = useLocation();
  const route = parseRoute(path);
  useEffect(() => {
    if (!document.documentElement.dataset.ryugiArtifactId) return;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) return;
    const url = new URL(location.href);
    url.pathname = new URL(canonical.href).pathname;
    if (url.href !== location.href) history.replaceState(history.state, '', url);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);
  if (route.kind === 'list') return local(<ArtifactList />);
  if (route.kind === 'unknown')
    return <div {...stylex.props(styles.unknown)}>No artifact lives at this address.</div>;
  const id = document.documentElement.dataset.ryugiArtifactId ?? route.id;
  if (route.kind === 'preview') return <PreviewLayout type={route.type} id={id} />;
  if (route.type === 'html') return local(<HtmlLayout id={id} />);
  if (route.type === 'document') return local(<DocumentLayout id={id} />);
  return local(<ArtboardLayout id={id} />);
}

export function Shell() {
  return (
    <Suspense
      fallback={
        <div {...stylex.props(styles.unknown)} role="status">
          {t('common.loading')}
        </div>
      }
    >
      <RouteView />
    </Suspense>
  );
}
