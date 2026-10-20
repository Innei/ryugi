import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { ArtboardLayout } from './layouts/ArtboardLayout';
import { ArtifactList } from './layouts/ArtifactList';
import { CloudLayout } from './layouts/CloudLayout';
import { DocumentLayout } from './layouts/DocumentLayout';
import { HtmlLayout } from './layouts/HtmlLayout';
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

export function Shell() {
  const route = parseRoute(location.pathname);
  if (route.kind === 'list') return <ArtifactList />;
  if (route.kind === 'cloud') return <CloudLayout id={route.id} />;
  if (route.kind === 'unknown') return <div {...stylex.props(styles.unknown)}>No artifact lives at this address.</div>;
  if (route.type === 'html') return <HtmlLayout id={route.id} />;
  if (route.type === 'document') return <DocumentLayout id={route.id} />;
  return <ArtboardLayout id={route.id} />;
}
