import { toast, type ContextMenuItem } from '@lobehub/ui';
import { ArrowUpRight, ExternalLink, EyeOff, Folder, Globe, Link, ListChecks, Lock, SquareCheckBig, Trash2, UserRound } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { Visibility } from '../../shared/cloud';
import { isSlotLimit, openPlanLimitDialog } from '../components/PlanLimitDialog';
import type { CloudFilter, CloudListItem } from './cloud-list';
import { changeVisibility, CloudRequestError, planLimitMessage, setOnProfile } from './cloud-shell';
import { openContextMenu } from './context-menu';
import { i18n } from '../i18n';

export const artifactMenuKey = (id: string) => `artifact:${id}`;
export const projectMenuKey = (project: string | null) => `project:${project ?? ''}`;

interface Options {
  all: CloudListItem[];
  filter: CloudFilter;
  busy: boolean;
  profilePath: string | null;
  setBusy: (busy: boolean) => void;
  changeFilter: (next: CloudFilter) => void;
  startSelecting: (ids: string[]) => void;
  confirmDelete: (items: CloudListItem[]) => void;
  patch: (id: string, change: Partial<CloudListItem>) => void;
  refreshPlan: () => void;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const listed = (artifact: CloudListItem) => artifact.visibility === 'public' && artifact.onProfile !== false;

export function cloudListMenus({ all, filter, busy, profilePath, setBusy, changeFilter, startSelecting, confirmDelete, patch, refreshPlan }: Options) {
  const t = i18n.t.bind(i18n);

  const setVisibility = async (artifact: CloudListItem, visibility: Visibility) => {
    try {
      patch(artifact.id, { visibility: await changeVisibility(artifact.id, visibility) });
      refreshPlan();
    } catch (error) {
      if (error instanceof CloudRequestError && error.limit && isSlotLimit(error.limit)) {
        openPlanLimitDialog({ limit: error.limit, title: artifact.title, upgradeUrl: error.upgradeUrl ?? '/billing' });
      } else {
        toast.error({ title: t('cloudMenu.changeFailed', { title: artifact.title ?? artifact.id }), description: message(error) });
      }
    }
  };

  const setProfile = async (artifact: CloudListItem, shown: boolean) => {
    try {
      await setOnProfile(artifact.id, shown);
      patch(artifact.id, { onProfile: shown });
    } catch (error) {
      toast.error(message(error));
    }
  };

  const copyLink = async (artifact: CloudListItem) => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/a/${artifact.id}`);
      toast.success(t('cloudMenu.copied'));
    } catch {
      toast.error(t('cloudMenu.copyFailed'));
    }
  };

  const bulk = async (targets: CloudListItem[], run: (artifact: CloudListItem) => Promise<void>, done: (count: number) => string, some: (count: number) => string) => {
    setBusy(true);
    let count = 0;
    let failure: unknown = null;
    for (const artifact of targets) {
      try {
        await run(artifact);
        count += 1;
      } catch (error) {
        failure = error;
        break;
      }
    }
    setBusy(false);
    if (failure === null) return toast.success(done(count));
    const limit = failure instanceof CloudRequestError ? failure.limit : undefined;
    toast.error({
      title: some(count),
      description: limit ? planLimitMessage(limit) : message(failure),
      actions: limit ? [{ label: t('common.upgradePro'), variant: 'primary', onClick: () => location.assign((failure as CloudRequestError).upgradeUrl ?? '/billing') }] : undefined,
    });
  };

  const bulkVisibility = async (targets: CloudListItem[], visibility: Visibility) => {
    const key = visibility === 'public' ? 'shared' : 'privated';
    await bulk(targets, async (artifact) => patch(artifact.id, { visibility: await changeVisibility(artifact.id, visibility) }),
      (count) => t(`cloudMenu.${key}All`, { count }), (done) => t(`cloudMenu.${key}Some`, { done, total: targets.length }));
    refreshPlan();
  };

  const hideAll = (targets: CloudListItem[]) => bulk(targets, async (artifact) => {
    await setOnProfile(artifact.id, false);
    patch(artifact.id, { onProfile: false });
  }, (count) => t('cloudMenu.hidAll', { count }), (done) => t('cloudMenu.hidSome', { done, total: targets.length }));

  const artifactMenu = (event: MouseEvent, artifact: CloudListItem) => {
    const url = `/a/${artifact.id}`;
    const isPublic = artifact.visibility === 'public';
    const items: ContextMenuItem[] = [
      { key: 'open', label: t('common.open'), icon: ArrowUpRight, onClick: () => location.assign(url) },
      { key: 'new-tab', label: t('cloudMenu.openNewTab'), icon: ExternalLink, onClick: () => { window.open(url, '_blank', 'noopener'); } },
      { key: 'copy', label: t('cloudMenu.copyLink'), icon: Link, onClick: () => void copyLink(artifact) },
      { type: 'divider' },
      {
        type: 'submenu', key: 'who', label: t('cloudLibrary.whoCanSee'), icon: isPublic ? Globe : Lock, disabled: busy,
        children: [
          { type: 'checkbox', key: 'public', label: t('visibility.anyoneWithLink'), checked: isPublic, closeOnClick: true, onCheckedChange: () => { if (!isPublic) void setVisibility(artifact, 'public'); } },
          { type: 'checkbox', key: 'private', label: t('visibility.onlyMe'), checked: !isPublic, closeOnClick: true, onCheckedChange: () => { if (isPublic) void setVisibility(artifact, 'private'); } },
        ],
      },
      { type: 'checkbox', key: 'profile', label: t('cloudProfile.showOnProfile'), icon: UserRound, checked: listed(artifact), disabled: !isPublic || !profilePath || busy, closeOnClick: true, onCheckedChange: (shown) => void setProfile(artifact, shown) },
      { type: 'divider' },
      { key: 'select', label: t('cloudMenu.select'), icon: SquareCheckBig, disabled: busy, onClick: () => startSelecting([artifact.id]) },
      { key: 'delete', label: t('cloudLibrary.deleteEllipsis'), icon: Trash2, danger: true, disabled: busy, onClick: () => confirmDelete([artifact]) },
    ];
    openContextMenu(event, artifactMenuKey(artifact.id), items);
  };

  const projectMenu = (event: MouseEvent, project: string | null) => {
    const name = project ?? t('common.other');
    const members = all.filter((artifact) => artifact.project === project);
    const privates = members.filter((artifact) => artifact.visibility === 'private');
    const publics = members.filter((artifact) => artifact.visibility === 'public');
    const shown = members.filter(listed);
    const total = members.length;
    const items: ContextMenuItem[] = [
      { key: 'only', label: t('cloudMenu.showOnly', { name }), icon: Folder, onClick: () => changeFilter({ ...filter, project }) },
      { key: 'select-all', label: t('cloudMenu.selectAll', { count: total }), icon: ListChecks, disabled: busy, onClick: () => { changeFilter({ project }); startSelecting(members.map((artifact) => artifact.id)); } },
      { type: 'divider' },
      { key: 'share-all', label: t('cloudMenu.shareAll'), extra: <span className="cloud-menu-count">{t('cloudMenu.ofTotal', { count: privates.length, total })}</span>, icon: Globe, disabled: busy || privates.length === 0, onClick: () => void bulkVisibility(privates, 'public') },
      { key: 'private-all', label: t('cloudMenu.privateAll'), extra: <span className="cloud-menu-count">{t('cloudMenu.ofTotal', { count: publics.length, total })}</span>, icon: Lock, disabled: busy || publics.length === 0, onClick: () => void bulkVisibility(publics, 'private') },
      { key: 'hide-all', label: t('cloudMenu.hideAll'), icon: EyeOff, disabled: busy || shown.length === 0 || !profilePath, onClick: () => void hideAll(shown) },
      { type: 'divider' },
      { key: 'delete-all', label: t('cloudMenu.deleteAll', { count: total }), icon: Trash2, danger: true, disabled: busy, onClick: () => confirmDelete(members) },
    ];
    openContextMenu(event, projectMenuKey(project), items, { header: <span className="cloud-menu-head">{name} · {t('cloudLibrary.artifacts', { count: total })}</span> });
  };

  return { artifactMenu, projectMenu };
}
