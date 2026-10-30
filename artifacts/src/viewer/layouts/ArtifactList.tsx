import { Button, Input, Segmented, Select } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
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

const styles = stylex.create({
  library: {
    minHeight: '100%',
    backgroundColor: cssVar.colorBgContainerSecondary,
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 13,
  },
  topbar: {
    'height': 48,
    'boxSizing': 'border-box',
    'paddingInline': 24,
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'space-between',
    'gap': 16,
    'borderBottomWidth': 1,
    'borderBottomStyle': 'solid',
    'borderBottomColor': cssVar.colorBorderSecondary,
    'backgroundColor': cssVar.colorBgContainer,
    '@media (max-width: 700px)': { paddingInline: 16 },
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
    fontSize: 12,
  },
  logo: {
    width: 22,
    height: 22,
    flexShrink: 0,
    filter: { 'default': 'none', '@media (prefers-color-scheme: dark)': 'invert(1)' },
  },
  brand: {
    fontSize: 14,
    letterSpacing: '-0.5px',
    marginInlineStart: -5,
  },
  project: {
    'fontWeight': 550,
    'maxWidth': 220,
    'overflow': 'hidden',
    'textOverflow': 'ellipsis',
    'whiteSpace': 'nowrap',
    '@media (max-width: 700px)': { maxWidth: 130 },
  },
  slash: {
    color: cssVar.colorTextTertiary,
    fontSize: 17,
    fontWeight: 300,
  },
  slashLast: {
    'color': cssVar.colorTextTertiary,
    'fontSize': 17,
    'fontWeight': 300,
    '@media (max-width: 420px)': { display: 'none' },
  },
  section: {
    'color': cssVar.colorTextSecondary,
    '@media (max-width: 420px)': { display: 'none' },
  },
  status: {
    'display': 'flex',
    'alignItems': 'center',
    'gap': 7,
    'flexShrink': 0,
    'fontSize': 11,
    'color': cssVar.colorTextSecondary,
    '@media (max-width: 420px)': { fontSize: 10 },
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: cssVar.colorTextTertiary,
  },
  statusDotLive: {
    backgroundColor: cssVar.colorSuccess,
    boxShadow: `0 0 0 3px ${cssVar.colorSuccessBg}`,
  },
  main: {
    'boxSizing': 'border-box',
    'paddingBlockStart': 24,
    'paddingBlockEnd': 20,
    'paddingInline': 32,
    'maxWidth': 1800,
    'marginInline': 'auto',
    '@media (max-width: 700px)': {
      paddingBlockStart: 20,
      paddingBlockEnd: 20,
      paddingInline: 16,
    },
  },
  heading: { display: 'flex', alignItems: 'center', gap: 10 },
  headingTitle: {
    margin: 0,
    fontSize: 22,
    lineHeight: '28px',
    fontWeight: 600,
    letterSpacing: '-0.65px',
  },
  headingCount: {
    fontSize: 11,
    color: cssVar.colorTextSecondary,
    fontVariantNumeric: 'tabular-nums',
  },
  toolbar: {
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'space-between',
    'gap': 16,
    'marginTop': 16,
    'minHeight': 32,
    '@media (max-width: 700px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
      gap: 8,
    },
  },
  tabs: { flexShrink: 0 },
  tabLabel: {
    'display': 'inline-flex',
    'gap': 7,
    'alignItems': 'center',
    'fontSize': 12,
    '@media (max-width: 420px)': { gap: 4 },
  },
  tabCount: {
    fontSize: 10,
    color: cssVar.colorTextSecondary,
    fontVariantNumeric: 'tabular-nums',
  },
  tools: {
    'display': 'flex',
    'alignItems': 'center',
    'gap': 12,
    'minWidth': 0,
    '@media (max-width: 700px)': { justifyContent: 'space-between' },
  },
  search: {
    'width': 210,
    'maxWidth': '100%',
    'minWidth': 0,
    '@media (max-width: 700px)': { width: '100%', maxWidth: 300 },
  },
  searchKey: {
    fontFamily: cssVar.fontFamilyCode,
    fontSize: 10,
    lineHeight: '18px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorder,
    borderRadius: 4,
    minWidth: 18,
    textAlign: 'center',
    color: cssVar.colorTextSecondary,
  },
  sort: { width: 160, flexShrink: 0 },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  grid: {
    'display': 'grid',
    'gridTemplateColumns': 'repeat(auto-fill, minmax(260px, 1fr))',
    'gap': 12,
    'marginBlockStart': 16,
    'marginBlockEnd': 0,
    'marginInline': 0,
    'padding': 0,
    'listStyle': 'none',
    '@media (max-width: 700px)': {
      gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
    },
  },
  gridItem: { minWidth: 0 },
  card: {
    'display': 'block',
    'height': 196,
    'boxSizing': 'border-box',
    'borderWidth': 1,
    'borderStyle': 'solid',
    'borderColor': cssVar.colorBorderSecondary,
    'borderRadius': 8,
    'overflow': 'hidden',
    'backgroundColor': cssVar.colorBgContainer,
    'color': 'inherit',
    'textDecoration': 'none',
    'transitionProperty': 'border-color',
    'transitionDuration': '120ms',
    ':hover': { borderColor: cssVar.colorTextTertiary },
    ':focus-visible': {
      outlineWidth: 2,
      outlineStyle: 'solid',
      outlineColor: cssVar.colorPrimary,
      outlineOffset: 3,
    },
    '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0s' },
  },
  cardInfo: { paddingBlock: 8, paddingInline: 12 },
  cardTitle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 13,
    lineHeight: '18px',
    fontWeight: 550,
  },
  cardTitleText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardIcon: { flexShrink: 0, color: cssVar.colorTextSecondary },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 3,
    fontSize: 11,
    lineHeight: '16px',
    color: cssVar.colorTextSecondary,
  },
  cardMetaGroup: { display: 'flex', alignItems: 'center', gap: 5 },
  cardTime: { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 16,
    fontSize: 10,
    color: cssVar.colorTextSecondary,
  },
  footerGroup: { display: 'flex', alignItems: 'center', gap: 7 },
  footerLogo: { width: 13, height: 13, opacity: 0.5 },
  footerCode: {
    'fontSize': 10,
    'color': cssVar.colorTextSecondary,
    'overflow': 'hidden',
    'textOverflow': 'ellipsis',
    'whiteSpace': 'nowrap',
    '@media (max-width: 700px)': { display: 'none' },
  },
  empty: {
    paddingBlock: 70,
    paddingInline: 16,
    textAlign: 'center',
    color: cssVar.colorTextSecondary,
  },
  emptyIcon: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    margin: '0 0 8px',
    fontSize: 16,
    color: cssVar.colorText,
    fontWeight: 550,
  },
  emptyBody: { margin: '0 0 16px', fontSize: 12, lineHeight: 1.8 },
  error: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginTop: 16,
    backgroundColor: cssVar.colorErrorBg,
    color: cssVar.colorErrorText,
    borderRadius: 6,
    fontSize: 12,
  },
});

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
      <span {...stylex.props(styles.tabLabel)}>
        {labels[value]}
        <span {...stylex.props(styles.tabCount)}>
          {value === 'all'
            ? (artifacts?.length ?? 0)
            : (artifacts?.filter((a) => a.type === value).length ?? 0)}
        </span>
      </span>
    ),
  }));

  return (
    <div {...stylex.props(styles.library)}>
      <header {...stylex.props(styles.topbar)}>
        <div {...stylex.props(styles.breadcrumb)}>
          <img alt="" src={logo} {...stylex.props(styles.logo)} />
          <strong {...stylex.props(styles.brand)}>ryugi</strong>
          <span {...stylex.props(styles.slash)}>/</span>
          <b {...stylex.props(styles.project)}>{project || t('common.project')}</b>
          <span {...stylex.props(styles.slashLast)}>/</span>
          <span {...stylex.props(styles.section)}>Artifacts</span>
        </div>
        <span {...stylex.props(styles.status)}>
          <i data-live={live} {...stylex.props(styles.statusDot, live && styles.statusDotLive)} />
          {live ? t('library.localProject') : t('library.reconnecting')}
        </span>
      </header>
      <main {...stylex.props(styles.main)}>
        <div {...stylex.props(styles.heading)}>
          <h1 {...stylex.props(styles.headingTitle)}>Artifacts</h1>
          <span {...stylex.props(styles.headingCount)}>
            {artifacts ? t('library.count', { count: artifacts.length }) : '…'}
          </span>
        </div>
        <div {...stylex.props(styles.toolbar)}>
          <Segmented<ArtifactType | 'all'>
            className={stylex.props(styles.tabs).className}
            options={options}
            size="small"
            styles={{ item: { height: 30, paddingInline: 8 } }}
            value={type}
            onChange={setType}
          />
          <div {...stylex.props(styles.tools)}>
            <Input
              aria-label={t('library.searchLabel')}
              className={stylex.props(styles.search).className}
              placeholder={t('library.searchPlaceholder')}
              prefix={<Search size={16} />}
              ref={searchRef}
              suffix={<kbd {...stylex.props(styles.searchKey)}>/</kbd>}
              value={query}
              variant="filled"
              onChange={(event) => setQuery(event.target.value)}
            />
            <label {...stylex.props(styles.srOnly)} htmlFor="artifact-sort">
              {t('library.sortLabel')}
            </label>
            <Select
              className={stylex.props(styles.sort).className}
              id="artifact-sort"
              options={sortOptions}
              value={sort}
              variant="filled"
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
        {artifacts === null && !error && (
          <p {...stylex.props(styles.empty)} role="status">
            {t('library.loadingList')}
          </p>
        )}
        {artifacts?.length === 0 && (
          <div {...stylex.props(styles.empty)}>
            <div {...stylex.props(styles.emptyIcon)}>
              <RyugiMark size={28} />
            </div>
            <h2 {...stylex.props(styles.emptyTitle)}>{t('library.emptyTitle')}</h2>
            <p {...stylex.props(styles.emptyBody)}>{t('library.emptyBody')}</p>
          </div>
        )}
        {artifacts !== null && artifacts.length > 0 && items.length === 0 && (
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
          {items.map((artifact) => {
            return (
              <li key={`${artifact.type}/${artifact.id}`} {...stylex.props(styles.gridItem)}>
                <a
                  aria-label={t('library.open', { title: artifact.title })}
                  href={artifact.url ?? `/${artifact.type}/${artifact.id}`}
                  {...stylex.props(styles.card)}
                >
                  <ArtifactThumbnail
                    src={`/api/thumbnail${artifact.url ?? `/${artifact.type}/${artifact.id}`}.svg?v=${artifact.updatedAt}`}
                    type={artifact.type}
                  />
                  <div {...stylex.props(styles.cardInfo)}>
                    <div {...stylex.props(styles.cardTitle)}>
                      <span title={artifact.title} {...stylex.props(styles.cardTitleText)}>
                        {artifact.title}
                      </span>
                      <ArrowUpRight
                        aria-hidden="true"
                        size={13}
                        {...stylex.props(styles.cardIcon)}
                      />
                    </div>
                    <div {...stylex.props(styles.cardMeta)}>
                      <span {...stylex.props(styles.cardMetaGroup)}>
                        <TypeIcon size={12} type={artifact.type} />
                        {labels[artifact.type]}
                      </span>
                      <time
                        dateTime={new Date(artifact.updatedAt).toISOString()}
                        title={new Date(artifact.updatedAt).toLocaleString(i18n.language)}
                        {...stylex.props(styles.cardTime)}
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
        <footer {...stylex.props(styles.footer)}>
          <span {...stylex.props(styles.footerGroup)}>
            <img alt="" src={logo} {...stylex.props(styles.logo, styles.footerLogo)} />
            {t('library.footer')}
          </span>
          <code {...stylex.props(styles.footerCode)}>
            {project ? `${project} / ` : ''}.ryugi / artifacts
          </code>
        </footer>
      </main>
      <WarningsBadge warnings={warnings} />
    </div>
  );
}
