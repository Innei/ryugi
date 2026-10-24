import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, type ReactNode } from 'react';
import { AutoPublishBar } from './components/AutoPublishPrompt';
import { ArtboardLayout } from './layouts/ArtboardLayout';
import { ArtifactList } from './layouts/ArtifactList';
import { CloudLayout } from './layouts/CloudLayout';
import { CloudArtifactList } from './layouts/CloudArtifactList';
import { CloudShell } from './layouts/CloudShell';
import { DocumentLayout } from './layouts/DocumentLayout';
import { HtmlLayout } from './layouts/HtmlLayout';
import { CloudPreviewLayout, PreviewLayout } from './layouts/PreviewLayout';
import { parseRoute } from './lib/route';

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

export function Shell() {
  const route = parseRoute(location.pathname, document.documentElement.dataset.ryugiHost === 'cloud');
  useEffect(() => {
    if (!document.documentElement.dataset.ryugiArtifactId) return;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) return;
    const url = new URL(location.href);
    url.pathname = new URL(canonical.href).pathname;
    if (url.href !== location.href) history.replaceState(history.state, '', url);
  }, []);
  if (route.kind === 'list') return local(<ArtifactList />);
  if (route.kind === 'cloud-list') return <CloudArtifactList />;
  if (route.kind === 'cloud') return <CloudShell id={route.id} />;
  if (route.kind === 'cloud-view') return <CloudLayout id={route.id} />;
  if (route.kind === 'cloud-preview') return <CloudPreviewLayout id={route.id} />;
  if (route.kind === 'unknown') return <div {...stylex.props(styles.unknown)}>No artifact lives at this address.</div>;
  const id = document.documentElement.dataset.ryugiArtifactId ?? route.id;
  if (route.kind === 'preview') return <PreviewLayout type={route.type} id={id} />;
  if (route.type === 'html') return local(<HtmlLayout id={id} />);
  if (route.type === 'document') return local(<DocumentLayout id={id} />);
  return local(<ArtboardLayout id={id} />);
}
