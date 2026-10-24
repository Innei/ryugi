import { createModal, useModalContext } from '@lobehub/ui';
import { Plus } from 'lucide-react';
import type { PlanLimit } from '../lib/cloud-shell';
import './plan-limit.css';
import { useTranslation } from '../i18n';

type SlotLimit = PlanLimit & { kind: 'public' | 'private' };

export const isSlotLimit = (limit: PlanLimit): limit is SlotLimit => limit.kind === 'public' || limit.kind === 'private';

export function PlanLimitDialog({ limit, title, upgradeUrl, onClose }: { limit: SlotLimit; title: string | null; upgradeUrl: string; onClose: () => void }) {
  const { t } = useTranslation();
  const isPublic = limit.kind === 'public';
  return (
    <div className="plan-limit">
      <h2>{t(isPublic ? 'planLimit.titlePublic' : 'planLimit.titlePrivate')}</h2>
      <p className="plan-limit-lead">{t(isPublic ? 'planLimit.leadPublic' : 'planLimit.leadPrivate', { title: title ?? t('planLimit.thisWork'), max: limit.max })}</p>
      <div className="plan-limit-slots" aria-hidden="true">
        {Array.from({ length: limit.max }, (_, index) => <i key={index} className="plan-limit-slot" />)}
        <i className="plan-limit-extra"><Plus size={14} /></i>
        <span className="cloud-mono">{limit.used} / {limit.max}</span>
      </div>
      <div className="plan-limit-actions">
        <a className="plan-limit-upgrade" href={upgradeUrl}>{t('common.upgradePro')}<span className="cloud-mono">{t('planLimit.upgradePrice')}</span></a>
        <a className="plan-limit-tidy" href={`/?visibility=${limit.kind}`}>{t(isPublic ? 'planLimit.tidyPublic' : 'planLimit.tidyPrivate')}</a>
        <button type="button" className="plan-limit-stay" onClick={onClose}>{t(isPublic ? 'planLimit.stayPrivate' : 'planLimit.stayPublic')}</button>
      </div>
      <p className="plan-limit-foot">{t('planLimit.discount')}</p>
    </div>
  );
}

function ModalPlanLimit(props: { limit: SlotLimit; title: string | null; upgradeUrl: string }) {
  const { close } = useModalContext();
  return <PlanLimitDialog {...props} onClose={close} />;
}

export function openPlanLimitDialog(props: { limit: SlotLimit; title: string | null; upgradeUrl: string }) {
  createModal({ content: <ModalPlanLimit {...props} />, width: 440, footer: null, title: null });
}
