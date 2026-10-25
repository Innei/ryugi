import { Link } from 'wouter';
import logo from '../../../../assets/ryugi-small.svg';
import { CloudPlanUsage, type PlanSummary } from './CloudPlanUsage';
import { useTranslation } from '../i18n';

export type CloudTab = 'artifacts' | 'overview';

const TABS: { tab: CloudTab; href: string; label: string }[] = [
  { tab: 'artifacts', href: '/', label: 'cloudTabs.artifacts' },
  { tab: 'overview', href: '/overview', label: 'cloudTabs.overview' },
];

export function CloudTopBar({ active, login, summary }: { active: CloudTab | null; login: string | null; summary: PlanSummary | null }) {
  const { t } = useTranslation();
  return (
    <header className="library-topbar cloud-topbar">
      <div className="library-breadcrumb"><img className="library-logo" src={logo} alt="" /><strong>ryugi</strong><span>/</span><b>Cloud</b></div>
      {login && (
        <nav className="cloud-tabs" aria-label={t('cloudTabs.label')}>
          {TABS.map(({ tab, href, label }) => <Link key={tab} href={href} aria-current={tab === active ? 'page' : undefined}>{t(label)}</Link>)}
        </nav>
      )}
      {login && <div className="library-topbar-end"><CloudPlanUsage summary={summary} /><Link className="library-status cloud-account-link" href="/account" title={t('cloudAccount.title')}>{login}</Link></div>}
    </header>
  );
}
