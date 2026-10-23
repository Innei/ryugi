import { createModal, useModalContext } from '@lobehub/ui';
import { Plus } from 'lucide-react';
import type { PlanLimit } from '../lib/cloud-shell';
import './plan-limit.css';

type SlotLimit = PlanLimit & { kind: 'public' | 'private' };

const NAMES = { public: '公开', private: '私有' } as const;

export const isSlotLimit = (limit: PlanLimit): limit is SlotLimit => limit.kind === 'public' || limit.kind === 'private';

export function PlanLimitDialog({ limit, title, upgradeUrl, onClose }: { limit: SlotLimit; title: string | null; upgradeUrl: string; onClose: () => void }) {
  const name = NAMES[limit.kind];
  const stays = limit.kind === 'public' ? '私有' : '公开';
  const consequence = limit.kind === 'public' ? '只有你能打开' : '有链接的人仍能打开';
  return (
    <div className="plan-limit">
      <h2>{name}名额已用完</h2>
      <p className="plan-limit-lead">「{title ?? '这个作品'}」会保持{stays}，{consequence}。免费版最多{name} {limit.max} 个作品。</p>
      <div className="plan-limit-slots" aria-hidden="true">
        {Array.from({ length: limit.max }, (_, index) => <i key={index} className="plan-limit-slot" />)}
        <i className="plan-limit-extra"><Plus size={14} /></i>
        <span className="cloud-mono">{limit.used} / {limit.max}</span>
      </div>
      <div className="plan-limit-actions">
        <a className="plan-limit-upgrade" href={upgradeUrl}>升级到 Pro<span className="cloud-mono">$5 / 月 · 500 个名额</span></a>
        <a className="plan-limit-tidy" href={`/?visibility=${limit.kind}`}>去整理{name}作品</a>
        <button type="button" className="plan-limit-stay" onClick={onClose}>先保持{stays}</button>
      </div>
      <p className="plan-limit-foot">有折扣码？在付款页填写。</p>
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
