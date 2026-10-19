import { Tag } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useEffect, useState } from 'react';
import type { ArtifactSummary } from '../../shared/types';
import { WarningsBadge } from '../components/WarningsBadge';
import { useArtifactSocket } from '../hooks/useArtifactSocket';

const styles = stylex.create({
  root: {
    minHeight: '100%',
    paddingBlock: 48,
    paddingInline: 16,
    backgroundColor: cssVar.colorBgLayout,
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
  },
  column: { maxWidth: 640, marginInline: 'auto' },
  heading: { margin: 0, marginBottom: 20, fontSize: 20, fontWeight: 600 },
  list: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingBlock: 12,
    paddingInline: 14,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorderSecondary,
    borderRadius: 10,
    backgroundColor: { default: cssVar.colorBgContainer, ':hover': cssVar.colorFillQuaternary },
    color: 'inherit',
    textDecoration: 'none',
  },
  title: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 },
  id: { color: cssVar.colorTextTertiary, fontFamily: cssVar.fontFamilyCode, fontSize: 12 },
  empty: { color: cssVar.colorTextSecondary, fontSize: 14 },
});

export function ArtifactList() {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/artifacts', { cache: 'no-store' });
      const next = (await res.json()) as { artifacts: ArtifactSummary[]; warnings: string[] };
      setArtifacts(next.artifacts);
      setWarnings(next.warnings);
    } catch {
      setArtifacts((prev) => prev ?? []);
    }
  }, []);

  useArtifactSocket(() => void refresh(), refresh);

  useEffect(() => {
    document.title = 'Artifacts';
    void refresh();
  }, [refresh]);

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.column)}>
        <h1 {...stylex.props(styles.heading)}>Artifacts</h1>
        {artifacts && artifacts.length === 0 && (
          <p {...stylex.props(styles.empty)}>No artifacts yet. They appear here when the agent writes one.</p>
        )}
        <ul {...stylex.props(styles.list)}>
          {(artifacts ?? []).map((artifact) => (
            <li key={`${artifact.type}/${artifact.id}`}>
              <a href={`/${artifact.type}/${artifact.id}`} {...stylex.props(styles.link)}>
                <Tag>{artifact.type}</Tag>
                <span {...stylex.props(styles.title)}>{artifact.title}</span>
                <span {...stylex.props(styles.id)}>{artifact.id}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <WarningsBadge warnings={warnings} />
    </div>
  );
}
