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
import { filterArtifacts, relativeUpdatedAt, type ArtifactSort } from '../lib/artifact-list';

const labels = { all: '全部', artboard: 'Artboard', document: 'Document', html: 'HTML' };
const sortOptions = [
  { label: '最近更新', value: 'recent' },
  { label: '最早更新', value: 'oldest' },
  { label: '名称 A–Z', value: 'name' },
];

export function ArtifactList() {
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
      const next = await response.json() as { project: string; artifacts: ArtifactSummary[]; warnings: string[] };
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
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !target.closest('input,textarea,[contenteditable="true"]')) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    addEventListener('keydown', shortcut);
    return () => { clearInterval(timer); removeEventListener('keydown', shortcut); };
  }, [refresh]);

  const items = filterArtifacts(artifacts ?? [], type, query, sort);
  const options = (['all', ...ARTIFACT_TYPES] as const).map((value) => ({
    value,
    label: <span className="library-tab-label">{labels[value]}<span>{value === 'all' ? artifacts?.length ?? 0 : artifacts?.filter((a) => a.type === value).length ?? 0}</span></span>,
  }));

  return (
    <div className="artifact-library">
      <header className="library-topbar">
        <div className="library-breadcrumb"><img className="library-logo" src={logo} alt="" /><strong>ryugi</strong><span>/</span><b>{project || '项目'}</b><span>/</span><span>Artifacts</span></div>
        <span className="library-status"><i data-live={live} />{live ? '本地项目' : '正在重连…'}</span>
      </header>
      <main className="library-main">
        <div className="library-heading"><h1>Artifacts</h1><span>{artifacts?.length ?? '…'} 个 Artifact</span></div>
        <div className="library-toolbar">
          <Segmented<ArtifactType | 'all'> className="library-tabs" size="small" styles={{ item: { height: 30, paddingInline: 8 } }} value={type} options={options} onChange={setType} />
          <div className="library-tools">
            <Input ref={searchRef} className="library-search" variant="filled" prefix={<Search size={16} />} suffix={<kbd>/</kbd>} aria-label="搜索 Artifact" placeholder="搜索 Artifact…" value={query} onChange={(event) => setQuery(event.target.value)} />
            <label className="library-sr-only" htmlFor="artifact-sort">排序方式</label>
            <Select id="artifact-sort" className="library-sort" variant="filled" value={sort} options={sortOptions} onSelect={setSort} />
          </div>
        </div>
        {error && <div className="library-error" role="alert">暂时无法加载 Artifact。<Button size="small" type="text" onClick={() => void refresh()}>重试</Button></div>}
        {artifacts === null && !error && <p className="library-empty" role="status">正在加载 Artifact…</p>}
        {artifacts?.length === 0 && <div className="library-empty"><RyugiMark size={28} /><h2>这个项目还没有 Artifact</h2><p>在项目中开始一次设计讨论，生成的画板、文档和 HTML 会出现在这里。</p></div>}
        {artifacts !== null && artifacts.length > 0 && items.length === 0 && <div className="library-empty"><Search size={24} /><h2>没有找到匹配的 Artifact</h2><p>试试其他关键词或类型。</p><Button size="small" onClick={() => { setQuery(''); setType('all'); }}>清除筛选</Button></div>}
        <ul className="library-grid" aria-label="Artifact 列表">
          {items.map((artifact) => {
            return (
              <li key={`${artifact.type}/${artifact.id}`}>
                <a className="library-card" href={`/${artifact.type}/${artifact.id}`} aria-label={`打开 ${artifact.title}`}>
                  <ArtifactThumbnail title={artifact.title} src={`/preview/${artifact.type}/${artifact.id}?v=${artifact.updatedAt}`} version={artifact.updatedAt} />
                  <div className="library-card-info">
                    <div className="library-card-title"><span title={artifact.title}>{artifact.title}</span><ArrowUpRight size={13} aria-hidden="true" /></div>
                    <div className="library-card-meta"><span><TypeIcon type={artifact.type} size={12} />{labels[artifact.type]}</span><time dateTime={new Date(artifact.updatedAt).toISOString()} title={new Date(artifact.updatedAt).toLocaleString()}>{relativeUpdatedAt(artifact.updatedAt, now)}</time></div>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
        <footer className="library-footer"><span><img className="library-logo" src={logo} alt="" />内容随项目文件实时更新</span><code>{project ? `${project} / ` : ''}.ryugi / artifacts</code></footer>
      </main>
      <WarningsBadge warnings={warnings} />
    </div>
  );
}
