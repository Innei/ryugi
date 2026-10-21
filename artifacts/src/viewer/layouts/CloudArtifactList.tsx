import './artifact-list.css';
import { ArrowUpRight, Code2, FileText, Globe, Lock, PanelsTopLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import logo from '../../../../assets/ryugi-small.svg';
import { relativeUpdatedAt } from '../lib/artifact-list';
import { groupByProject, type CloudListItem } from '../lib/cloud-list';

const labels = { artboard: 'Artboard', document: 'Document', html: 'HTML' };
const icons = { artboard: PanelsTopLeft, document: FileText, html: Code2 };

type Loaded = { state: 'loading' } | { state: 'signed-out' } | { state: 'error' } | { state: 'ready'; login: string; artifacts: CloudListItem[] };

export function CloudArtifactList() {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    document.title = 'Ryugi Cloud';
    void (async () => {
      try {
        const res = await fetch('/api/account/artifacts', { cache: 'no-store', credentials: 'same-origin' });
        if (res.status === 401) return setLoaded({ state: 'signed-out' });
        if (!res.ok) return setLoaded({ state: 'error' });
        const json = (await res.json()) as { login: string; artifacts: CloudListItem[] };
        setLoaded({ state: 'ready', login: json.login, artifacts: json.artifacts });
      } catch {
        setLoaded({ state: 'error' });
      }
    })();
  }, []);

  const groups = loaded.state === 'ready' ? groupByProject(loaded.artifacts) : [];
  const now = Date.now();

  return (
    <div className="artifact-library">
      <header className="library-topbar">
        <div className="library-breadcrumb"><img className="library-logo" src={logo} alt="" /><strong>ryugi</strong><span>/</span><span>Cloud</span></div>
        {loaded.state === 'ready' && <span className="library-status">{loaded.login}</span>}
      </header>
      <main className="library-main">
        {loaded.state === 'loading' && <p className="library-empty" role="status">正在加载…</p>}
        {loaded.state === 'error' && <p className="library-empty" role="alert">暂时无法加载你的 Artifact，稍后刷新重试。</p>}
        {loaded.state === 'signed-out' && (
          <div className="library-empty">
            <PanelsTopLeft size={28} />
            <h2>Ryugi Cloud</h2>
            <p>这里存放从 Ryugi 分享出来的 artifact。登录后可以看到你自己发布的全部 artifact。</p>
            <a href="/auth/login?return=/">用 GitHub 登录</a>
          </div>
        )}
        {loaded.state === 'ready' && groups.length === 0 && (
          <div className="library-empty"><PanelsTopLeft size={28} /><h2>还没有发布过 Artifact</h2><p>打开自动发布，或在本地分享面板里发布，它们会出现在这里。</p></div>
        )}
        {groups.map(({ project, artifacts }) => (
          <section key={project ?? ''} aria-label={project ?? '其他'}>
            <h2 className="library-group">{project ?? '其他'}<span>{artifacts.length}</span></h2>
            <ul className="library-grid">
              {artifacts.map((artifact) => {
                const Icon = icons[artifact.type];
                const Seen = artifact.visibility === 'public' ? Globe : Lock;
                const title = artifact.title ?? artifact.id;
                return (
                  <li key={artifact.id}>
                    <a className="library-card" href={`/a/${artifact.id}`}>
                      <div className="library-thumbnail" aria-hidden="true"><Icon size={28} /></div>
                      <div className="library-card-info">
                        <div className="library-card-title"><span title={title}>{title}</span><ArrowUpRight size={13} aria-hidden="true" /></div>
                        <div className="library-card-meta">
                          <span><Icon size={12} aria-hidden="true" />{labels[artifact.type]}</span>
                          <span><Seen size={12} aria-hidden="true" />{artifact.visibility === 'public' ? '公开' : '私有'}</span>
                          <time dateTime={artifact.updatedAt} title={new Date(artifact.updatedAt).toLocaleString()}>{relativeUpdatedAt(Date.parse(artifact.updatedAt), now)}</time>
                        </div>
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
