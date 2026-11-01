import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';

import type { HubProjectStatus } from '../../../shared/hub';
import { useTranslation } from '../../i18n';
import { statusStyles as styles } from './status-styles';

export function ServerLog({ projects }: { projects: HubProjectStatus[] }) {
  const { t } = useTranslation();
  const [project, setProject] = useState('');
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = project ? `?project=${encodeURIComponent(project)}` : '';
    void fetch(`/api/hub/log${query}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => response.json() as Promise<{ lines?: string[] }>)
      .then((body) => setLines(body.lines ?? []))
      .catch(() => !controller.signal.aborted && setLines([]));
    return () => controller.abort();
  }, [project]);

  return (
    <>
      <select
        aria-label={t('server.logFilter')}
        value={project}
        {...stylex.props(styles.logFilter)}
        onChange={(event) => setProject(event.target.value)}
      >
        <option value="">{t('server.logAll')}</option>
        {projects.map((entry) => (
          <option key={entry.dir} value={entry.dir}>
            {entry.name}
          </option>
        ))}
      </select>
      <pre {...stylex.props(styles.log)}>
        {lines === null ? '…' : lines.length ? lines.join('\n') : t('server.logEmpty')}
      </pre>
    </>
  );
}
