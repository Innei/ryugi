import { Button, Input, Segmented, Select, toast } from '@lobehub/ui';
import * as stylex from '@stylexjs/stylex';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import logo from '../../../../assets/ryugi-small.svg';
import type { HubArtifact, HubProjectStatus } from '../../shared/hub';
import { ARTIFACT_TYPES, type ArtifactType } from '../../shared/types';
import { AccountMenu } from '../components/AccountMenu';
import { RyugiMark } from '../components/RyugiMark';
import { WarningsBadge } from '../components/WarningsBadge';
import { useTranslation } from '../i18n';
import { type ArtifactSort, filterArtifacts } from '../lib/artifact-list';
import { ArtifactCard } from './home/ArtifactCard';
import { CommandPalette } from './home/CommandPalette';
import { homeArtifacts, type HomeSelection, type SearchScope } from './home/home-model';
import { styles } from './home/home-styles';
import { ProjectSidebar } from './home/ProjectSidebar';
import { StatusPill } from './home/StatusPill';
import { useHubArtifacts } from './home/useHubArtifacts';

const openArtifact = (artifact: HubArtifact, newTab: boolean) => {
  if (newTab) window.open(artifact.url, '_blank');
  else location.assign(artifact.url);
};

export function ArtifactList() {
  const { t } = useTranslation();
  const { list, error, refresh, removeProject } = useHubArtifacts();
  const [selection, setSelection] = useState<HomeSelection>('recent');
  const [scope, setScope] = useState<SearchScope>('project');
  const [type, setType] = useState<ArtifactType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ArtifactSort>('recent');
  const [palette, setPalette] = useState(false);
  const [now, setNow] = useState(Date.now);
  const searchRef = useRef<HTMLInputElement>(null);

  const artifacts = list?.artifacts ?? [];
  const projects: HubProjectStatus[] = (list?.projects ?? []).map((project) => ({
    ...project,
    artifacts: artifacts.filter((a) => a.project === project.dir).length,
  }));
  const selected = projects.find((project) => project.dir === selection) ?? null;
  const view: HomeSelection = selected ? selected.dir : 'recent';
  const everywhere = view === 'recent' || (scope === 'all' && query.trim() !== '');
  const base = homeArtifacts(artifacts, { selection: view, scope, query: '' });
  const items = filterArtifacts(
    homeArtifacts(artifacts, { selection: view, scope, query }),
    type,
    '',
    sort,
  );
  const nameOf = (dir: string) => projects.find((p) => p.dir === dir)?.name ?? dir;

  useEffect(() => {
    document.title = selected ? `${selected.name} · Artifacts` : 'Artifacts · Ryugi';
  }, [selected]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette((open) => !open);
      } else if (
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
  }, []);

  const remove = (project: HubProjectStatus) => {
    void removeProject(project.dir)
      .then(() => setSelection((current) => (current === project.dir ? 'recent' : current)))
      .catch(() => toast.error(t('home.removeFailed', { name: project.name })));
  };

  const tabs = (['all', ...ARTIFACT_TYPES] as const).map((value) => ({
    value,
    label: (
      <span {...stylex.props(styles.tabLabel)}>
        {t(`type.${value}`)}
        <span {...stylex.props(styles.tabCount)}>
          {value === 'all' ? base.length : base.filter((a) => a.type === value).length}
        </span>
      </span>
    ),
  }));
  const scopes: { value: SearchScope; label: string }[] = [
    { value: 'project', label: t('home.scopeProject') },
    { value: 'all', label: t('home.scopeAll') },
  ];
  const effectiveScope: SearchScope = view === 'recent' ? 'all' : scope;

  return (
    <div {...stylex.props(styles.library)}>
      <header {...stylex.props(styles.topbar)}>
        <div {...stylex.props(styles.breadcrumb)}>
          <img alt="" src={logo} {...stylex.props(styles.logo)} />
          <strong {...stylex.props(styles.brand)}>ryugi</strong>
          <span {...stylex.props(styles.slash)}>/</span>
          <b {...stylex.props(styles.crumb)}>{selected?.name ?? t('home.recentAll')}</b>
        </div>
        <div {...stylex.props(styles.topbarEnd)}>
          <StatusPill onProjectsChanged={() => void refresh()} />
          <AccountMenu />
        </div>
      </header>
      <div {...stylex.props(styles.body)}>
        <ProjectSidebar
          projects={projects}
          selection={view}
          total={artifacts.length}
          onRemove={remove}
          onSelect={setSelection}
        />
        <main {...stylex.props(styles.main)}>
          <div {...stylex.props(styles.heading)}>
            <h1 {...stylex.props(styles.headingTitle)}>{selected?.name ?? t('home.recent')}</h1>
            <span {...stylex.props(styles.headingCount)}>
              {list === null
                ? '…'
                : view === 'recent'
                  ? t('home.recentSubtitle')
                  : t('library.count', { count: base.length })}
            </span>
          </div>
          <div {...stylex.props(styles.toolbar)}>
            <Segmented<ArtifactType | 'all'>
              className={stylex.props(styles.tabs).className}
              options={tabs}
              size="small"
              styles={{ item: { height: 30, paddingInline: 8 } }}
              value={type}
              onChange={setType}
            />
            <div {...stylex.props(styles.tools)}>
              <div aria-label={t('home.scopeLabel')} role="group" {...stylex.props(styles.scope)}>
                {scopes.map((option) => (
                  <button
                    aria-pressed={effectiveScope === option.value}
                    disabled={view === 'recent' && option.value === 'project'}
                    key={option.value}
                    type="button"
                    {...stylex.props(
                      styles.scopeOption,
                      effectiveScope === option.value && styles.scopeOn,
                    )}
                    onClick={() => setScope(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Input
                aria-label={t('library.searchLabel')}
                className={stylex.props(styles.search).className}
                placeholder={t('home.searchAll')}
                prefix={<Search size={16} />}
                ref={searchRef}
                suffix={<kbd {...stylex.props(styles.searchKey)}>/</kbd>}
                type="search"
                value={query}
                variant="filled"
                onChange={(event) => setQuery(event.target.value)}
              />
              <Button
                aria-label={t('home.paletteLabel')}
                size="small"
                title={t('home.paletteLabel')}
                type="text"
                onClick={() => setPalette(true)}
              >
                <kbd {...stylex.props(styles.searchKey)}>⌘K</kbd>
              </Button>
              <label {...stylex.props(styles.srOnly)} htmlFor="artifact-sort">
                {t('library.sortLabel')}
              </label>
              <Select
                className={stylex.props(styles.sort).className}
                id="artifact-sort"
                value={sort}
                variant="filled"
                options={[
                  { label: t('library.sortRecent'), value: 'recent' },
                  { label: t('library.sortOldest'), value: 'oldest' },
                  { label: t('library.sortName'), value: 'name' },
                ]}
                onSelect={setSort}
              />
            </div>
          </div>
          {error && (
            <div {...stylex.props(styles.error)} role="alert">
              {t('library.loadFailed')}
              <Button size="small" type="text" onClick={() => void refresh()}>
                {t('common.retry')}
              </Button>
            </div>
          )}
          {list === null && !error && (
            <p {...stylex.props(styles.empty)} role="status">
              {t('library.loadingList')}
            </p>
          )}
          {list !== null && base.length === 0 && !query.trim() && (
            <div {...stylex.props(styles.empty)}>
              <div {...stylex.props(styles.emptyIcon)}>
                <RyugiMark size={28} />
              </div>
              <h2 {...stylex.props(styles.emptyTitle)}>
                {view === 'recent' ? t('home.emptyRecent') : t('library.emptyTitle')}
              </h2>
              <p {...stylex.props(styles.emptyBody)}>{t('library.emptyBody')}</p>
            </div>
          )}
          {list !== null && (base.length > 0 || query.trim()) && items.length === 0 && (
            <div {...stylex.props(styles.empty)}>
              <div {...stylex.props(styles.emptyIcon)}>
                <Search size={24} />
              </div>
              <h2 {...stylex.props(styles.emptyTitle)}>{t('library.noMatchTitle')}</h2>
              <p {...stylex.props(styles.emptyBody)}>{t('library.noMatchBody')}</p>
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
          <ul aria-label={t('library.listLabel')} {...stylex.props(styles.grid)}>
            {items.map((artifact) => (
              <li key={`${artifact.project}\n${artifact.url}`} {...stylex.props(styles.gridItem)}>
                <ArtifactCard
                  artifact={artifact}
                  now={now}
                  projectName={everywhere ? nameOf(artifact.project) : null}
                />
              </li>
            ))}
          </ul>
          <footer {...stylex.props(styles.footer)}>
            <span {...stylex.props(styles.footerGroup)}>
              <img alt="" src={logo} {...stylex.props(styles.logo, styles.footerLogo)} />
              {t('library.footer')}
            </span>
            {selected && (
              <code {...stylex.props(styles.footerCode)}>{selected.dir}/.ryugi/artifacts</code>
            )}
          </footer>
        </main>
      </div>
      {palette && (
        <CommandPalette
          artifacts={artifacts}
          projects={projects}
          onClose={() => setPalette(false)}
          onOpen={(artifact, newTab) => {
            setPalette(false);
            openArtifact(artifact, newTab);
          }}
        />
      )}
      <WarningsBadge warnings={list?.warnings ?? []} />
    </div>
  );
}
