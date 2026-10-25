import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';

export interface PlanSummary {
  plan: 'free' | 'pro';
  usage: { private: number; public: number; total: number; storage?: { bytes: number; objects: number } };
  limits: { private: number | null; public: number | null; total: number | null; storage?: { bytes: number; objects: number } };
}

const isSummary = (value: unknown): value is PlanSummary => {
  const summary = value as PlanSummary | null;
  return (summary?.plan === 'free' || summary?.plan === 'pro') && typeof summary.usage === 'object' && typeof summary.limits === 'object';
};

export function usePlanSummary(revision: unknown) {
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/billing', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => (res.ok ? res.json() : null))
      .then((body: unknown) => live && setSummary(isSummary(body) ? body : null))
      .catch(() => live && setSummary(null));
    return () => {
      live = false;
    };
  }, [revision]);
  return summary;
}

function Count({ label, used, max }: { label?: string; used: number; max: number | null }) {
  if (max === null) return null;
  const text = `${label ? `${label} ` : ''}${used}/${max}`;
  return <span className={`cloud-plan-count${used >= max ? ' is-full' : ''}`}>{text}</span>;
}

export function CloudPlanUsage({ summary }: { summary: PlanSummary | null }) {
  const { t } = useTranslation();
  if (!summary) return null;
  const { usage, limits } = summary;
  if (summary.plan === 'pro') {
    return (
      <span className="cloud-plan">
        <b>Pro</b>
        <Count used={usage.total} max={limits.total} />
        <a href="/billing">{t('planLimit.plans')}</a>
      </span>
    );
  }
  const tight = (limits.private !== null && usage.private >= limits.private) || (limits.public !== null && usage.public >= limits.public);
  return (
    <span className={`cloud-plan${tight ? ' is-tight' : ''}`}>
      <b>{t('planLimit.free')}</b>
      <Count label={t('visibility.private')} used={usage.private} max={limits.private} />
      <span aria-hidden>·</span>
      <Count label={t('visibility.public')} used={usage.public} max={limits.public} />
      <a href="/billing">{t('common.upgradePro')}</a>
    </span>
  );
}
