import './artifact-list.css';
import './cloud-library.css';
import './cloud-overview.css';
import { Button } from '@lobehub/ui';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import type { ArtifactType } from '../../shared/types';
import { DayBars } from '../components/DayBars';
import { RyugiMark } from '../components/RyugiMark';
import { TypeIcon } from '../components/TypeIcon';
import { i18n, useTranslation } from '../i18n';

interface Ranked {
  id: string;
  title: string | null;
  type: ArtifactType;
  views: number;
}

interface Overview {
  login: string;
  profilePath?: string;
  views: { days: { day: string; views: number }[]; total: number; previous: number };
  top: Ranked[];
  today: Ranked[];
  publicArtifacts: number;
  viewedThisWeek: number;
  publishes: { days: { day: string; publishes: number }[]; total: number };
}

type Loaded = { state: 'loading' } | { state: 'signed-out' } | { state: 'error' } | { state: 'ready'; overview: Overview };

const count = (n: number) => n.toLocaleString(i18n.language);

function Change({ total, previous }: { total: number; previous: number }) {
  const { t } = useTranslation();
  if (previous === 0) return <small>{t('cloudOverview.noPrevious')}</small>;
  const change = Math.round(((total - previous) / previous) * 100);
  return <small className={change > 0 ? 'is-up' : change < 0 ? 'is-down' : undefined}>{t('cloudOverview.change', { change: `${change > 0 ? '+' : ''}${change}%` })}</small>;
}

function RankList({ label, items, max }: { label: string; items: Ranked[]; max?: number }) {
  return (
    <ul className={max === undefined ? 'cloud-rank no-bar' : 'cloud-rank'}>
      {items.map((item) => (
        <li key={item.id}>
          <a href={`/a/${item.id}`}>
            <TypeIcon type={item.type} size={14} />
            <span className="cloud-rank-title">{item.title ?? item.id}</span>
            {max !== undefined && <span className="cloud-rank-bar" aria-hidden="true"><i style={{ width: `${(item.views / max) * 100}%` }} /></span>}
            <span className="cloud-rank-count">{count(item.views)}</span>
          </a>
        </li>
      ))}
      {items.length === 0 && <li className="cloud-rank-empty">{label}</li>}
    </ul>
  );
}

export function CloudOverview() {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    document.title = `${t('cloudTabs.overview')} · Ryugi Cloud`;
    setLoaded({ state: 'loading' });
    fetch('/api/account/overview', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) return setLoaded({ state: 'signed-out' });
        if (!res.ok) return setLoaded({ state: 'error' });
        setLoaded({ state: 'ready', overview: (await res.json()) as Overview });
      })
      .catch(() => !cancelled && setLoaded({ state: 'error' }));
    return () => { cancelled = true; };
  }, [revision]);

  const overview = loaded.state === 'ready' ? loaded.overview : null;
  const todayTotal = overview?.today.reduce((sum, item) => sum + item.views, 0) ?? 0;
  const activeDays = overview?.publishes.days.filter((day) => day.publishes > 0).length ?? 0;
  return (
    <>
      {loaded.state === 'loading' && <p className="library-empty" role="status">{t('common.loading')}</p>}
      {loaded.state === 'error' && <div className="library-empty" role="alert"><p>{t('cloudOverview.loadFailed')}</p><Button size="small" onClick={() => setRevision((value) => value + 1)}>{t('cloudLibrary.reload')}</Button></div>}
      {loaded.state === 'signed-out' && (
        <div className="library-empty">
          <RyugiMark size={28} /><h2>Ryugi Cloud</h2>
          <p>{t('cloudLibrary.signedOutBody')}</p>
          <a href="/auth/login?return=/overview">{t('common.signInGithub')}</a>
        </div>
      )}
      {overview && (
        <main className="cloud-overview-main">
          <div className="cloud-overview-head"><h1>{t('cloudTabs.overview')}</h1><span>{t('cloudOverview.lead')}</span>{overview.profilePath && <Link href={overview.profilePath}>{t('cloudOverview.viewProfile')}</Link>}</div>
          <section className="cloud-kpis">
            <div className="cloud-kpi"><span>{t('cloudOverview.views30')}</span><b>{count(overview.views.total)}</b><Change total={overview.views.total} previous={overview.views.previous} /></div>
            <div className="cloud-kpi"><span>{t('cloudOverview.publicArtifacts')}</span><b>{count(overview.publicArtifacts)}</b><small>{t('cloudOverview.viewedThisWeek', { count: overview.viewedThisWeek })}</small></div>
            <div className="cloud-kpi"><span>{t('cloudOverview.viewedToday')}</span><b>{count(todayTotal)}</b><small>{t('cloudOverview.acrossArtifacts', { count: overview.today.length })}</small></div>
            <div className="cloud-kpi"><span>{t('cloudOverview.publishes30')}</span><b>{count(overview.publishes.total)}</b><small>{t('cloudOverview.activeDays', { count: activeDays })}</small></div>
          </section>
          {overview.views.total === 0 && <p className="cloud-overview-empty">{t('cloudOverview.noViews')}</p>}
          <div className="cloud-overview-grid">
            <section aria-label={t('cloudOverview.pageViews')}>
              <h3>{t('cloudOverview.pageViews')}<span>{t('cloudOverview.last30Public')}</span></h3>
              <DayBars days={overview.views.days.map(({ day, views }) => ({ day, value: views }))} label={t('cloudOverview.viewsPerDay')} unit={(n) => t('cloudOverview.views', { count: n, formatted: count(n) })} />
            </section>
            <section aria-label={t('cloudOverview.mostViewed')}>
              <h3>{t('cloudOverview.mostViewed')}<span>{t('cloudOverview.days30')}</span></h3>
              <RankList label={t('cloudOverview.noneYet')} items={overview.top} max={overview.top[0]?.views ?? 1} />
            </section>
            <section aria-label={t('cloudOverview.publishes')}>
              <h3>{t('cloudOverview.publishes')}<span>{t('cloudOverview.publishesNote')}</span></h3>
              <DayBars tone="muted" height={72} days={overview.publishes.days.map(({ day, publishes }) => ({ day, value: publishes }))} label={t('cloudOverview.publishesPerDay')} unit={(n) => t('cloudOverview.publishCount', { count: n })} />
            </section>
            <section aria-label={t('cloudOverview.viewedToday')}>
              <h3>{t('cloudOverview.viewedToday')}</h3>
              <RankList label={t('cloudOverview.noneToday')} items={overview.today} />
            </section>
          </div>
          <footer className="cloud-overview-foot"><span>{t('cloudOverview.quotaNote')}</span><a href="/billing">{t('cloudOverview.planAndUsage')}</a></footer>
        </main>
      )}
    </>
  );
}
