import './artifact-list.css';

import { Button, Input, Segmented, Select } from '@lobehub/ui';
import { ArrowUpRight, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import logo from '../../../../assets/ryugi-small.svg';
import { ARTIFACT_TYPES, type ArtifactSummary, type ArtifactType } from '../../shared/types';
import { ArtifactThumbnail } from '../components/ArtifactThumbnail';
import { RyugiMark } from '../components/RyugiMark';
import { TypeIcon } from '../components/TypeIcon';
import { WarningsBadge } from '../components/WarningsBadge';
import { useArtifactSocket } from '../hooks/useArtifactSocket';
import { useTranslation } from '../i18n';
import { type ArtifactSort, filterArtifacts, relativeUpdatedAt } from '../lib/artifact-list';

export function ArtifactList() {
  const { t, i18n } = useTranslation();
  const labels = {
    all: t('type.all'),
    artboard: t('type.artboard'),
    document: t('type.document'),
    html: t('type.html'),
  };
  const sortOptions = [
    { label: t('library.sortRecent'), value: 'recent' },
    { label: t('library.sortOldest'), value: 'oldest' },
    { label: t('library.sortName'), value: 'name' },
  ];
  const [artifacts, setArtifacts] = useState<ArtifactSummary[] | null>(null);
  const [project, setProject] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [type, setType] = useState<ArtifactType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ArtifactSort>('recent');
  const [now, setNow] = useState(Date.now);
  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/artifacts', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load artifacts');
      const next = (await response.json()) as {
        project: string;
        artifacts: ArtifactSummary[];
        warnings: string[];
      };
      setArtifacts(next.artifacts);
      setProject(next.project);
      setWarnings(next.warnings);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  const { live } = useArtifactSocket((message) => {
    if (message.type === 'change') void refresh();
  }, refresh);

  useEffect(() => {
    document.title = project ? `${project} · Artifacts` : 'Artifacts · Ryugi';
  }, [project]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => setNow(Date.now()), 60000);
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !target.closest('input,textarea,[contenteditable="true"]')
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    addEventListener('keydown', shortcut);
    return () => {
      clearInterval(timer);
      removeEventListener('keydown', shortcut);
    };
  }, [refresh]);

  const items = filterArtifacts(artifacts ?? [], type, query, sort);
  const options = (['all', ...ARTIFACT_TYPES] as const).map((value) => ({
    value,
    label: (
      <span className="library-tab-label">
        {labels[value]}
        <span>
          {value === 'all'
            ? (artifacts?.length ?? 0)
            : (artifacts?.filter((a) => a.type === value).length ?? 0)}
        </span>
      </span>
    ),
  }));

  return (
    <div className="artifact-library">
      <header className="library-topbar">
        <div className="library-breadcrumb">
          <img alt="" className="library-logo" src={logo} />
          <strong>ryugi</strong>
          <span>/</span>
          <b>{project || t('common.project')}</b>
          <span>/</span>
          <span>Artifacts</span>
        </div>
        <span className="library-status">
          <i data-live={live} />
          {live ? t('library.localProject') : t('library.reconnecting')}
        </span>
      </header>
      <main className="library-main">
        <div className="library-heading">
          <h1>Artifacts</h1>
          <span>{artifacts ? t('library.count', { count: artifacts.length }) : '…'}</span>
        </div>
        <div className="library-toolbar">
          <Segmented<ArtifactType | 'all'>
            className="library-tabs"
            options={options}
            size="small"
            styles={{ item: { height: 30, paddingInline: 8 } }}
            value={type}
            onChange={setType}
          />
          <div className="library-tools">
            <Input
              aria-label={t('library.searchLabel')}
              className="library-search"
              placeholder={t('library.searchPlaceholder')}
              prefix={<Search size={16} />}
              ref={searchRef}
              suffix={<kbd>/</kbd>}
              value={query}
              variant="filled"
              onChange={(event) => setQuery(event.target.value)}
            />
            <label className="library-sr-only" htmlFor="artifact-sort">
              {t('library.sortLabel')}
            </label>
            <Select
              className="library-sort"
              id="artifact-sort"
              options={sortOptions}
              value={sort}
              variant="filled"
              onSelect={setSort}
            />
          </div>
        </div>
        {error && (
          <div className="library-error" role="alert">
            {t('library.loadFailed')}
            <Button size="small" type="text" onClick={() => void refresh()}>
              {t('common.retry')}
            </Button>
          </div>
        )}
        {artifacts === null && !error && (
          <p className="library-empty" role="status">
            {t('library.loadingList')}
          </p>
        )}
        {artifacts?.length === 0 && (
          <div className="library-empty">
            <RyugiMark size={28} />
            <h2>{t('library.emptyTitle')}</h2>
            <p>{t('library.emptyBody')}</p>
          </div>
        )}
        {artifacts !== null && artifacts.length > 0 && items.length === 0 && (
          <div className="library-empty">
            <Search size={24} />
            <h2>{t('library.noMatchTitle')}</h2>
            <p>{t('library.noMatchBody')}</p>
            <Button
              size="small"
              onClick={() => {
                setQuery('');
                setType('all');
              }}
            >
              {t('common.clearFilter')}
            </Button>
          </div>
        )}
        <ul aria-label={t('library.listLabel')} className="library-grid">
          {items.map((artifact) => {
            return (
              <li key={`${artifact.type}/${artifact.id}`}>
                <a
                  aria-label={t('library.open', { title: artifact.title })}
                  className="library-card"
                  href={artifact.url ?? `/${artifact.type}/${artifact.id}`}
                >
                  <ArtifactThumbnail
                    src={`/api/thumbnail${artifact.url ?? `/${artifact.type}/${artifact.id}`}.svg?v=${artifact.updatedAt}`}
                    type={artifact.type}
                  />
                  <div className="library-card-info">
                    <div className="library-card-title">
                      <span title={artifact.title}>{artifact.title}</span>
                      <ArrowUpRight aria-hidden="true" size={13} />
                    </div>
                    <div className="library-card-meta">
                      <span>
                        <TypeIcon size={12} type={artifact.type} />
                        {labels[artifact.type]}
                      </span>
                      <time
                        dateTime={new Date(artifact.updatedAt).toISOString()}
                        title={new Date(artifact.updatedAt).toLocaleString(i18n.language)}
                      >
                        {relativeUpdatedAt(artifact.updatedAt, now)}
                      </time>
                    </div>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
        <footer className="library-footer">
          <span>
            <img alt="" className="library-logo" src={logo} />
            {t('library.footer')}
          </span>
          <code>{project ? `${project} / ` : ''}.ryugi / artifacts</code>
        </footer>
      </main>
      <WarningsBadge warnings={warnings} />
    </div>
  );
}
