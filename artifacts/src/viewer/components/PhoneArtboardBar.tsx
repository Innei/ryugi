import { DropdownMenu } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Check, ChevronDown } from 'lucide-react';
import type { PageSpec } from '../../shared/types';
import { PublishMenu } from './PublishMenu';
import { t } from '../i18n';

export const PHONE_BAR_HEIGHT = 52;

const styles = stylex.create({
  bar: {
    flexShrink: 0,
    height: PHONE_BAR_HEIGHT,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    paddingInline: 16,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    backgroundColor: cssVar.colorBgContainer,
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 14,
  },
  title: { minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 600 },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    minWidth: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: cssVar.colorTextSecondary,
    fontFamily: cssVar.fontFamily,
    fontSize: 13,
    cursor: 'pointer',
  },
  pageName: { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  spacer: { flex: 1 },
  dot: { width: 7, height: 7, flexShrink: 0, borderRadius: '50%', backgroundColor: cssVar.colorTextQuaternary },
  dotOn: { backgroundColor: cssVar.colorSuccess },
});

interface PageSwitcherProps {
  pages: PageSpec[];
  page: string | null;
  onPageChange: (id: string) => void;
}

export function PageSwitcher({ pages, page, onPageChange }: PageSwitcherProps) {
  if (pages.length < 2) return null;
  const current = pages.find((p) => p.id === page);
  return (
    <DropdownMenu
      placement="bottomLeft"
      items={pages.map((p) => ({ key: p.id, label: p.name, icon: p.id === page ? Check : undefined, onClick: () => onPageChange(p.id) }))}
    >
      <button type="button" aria-label={t('chrome.switchPage')} {...stylex.props(styles.trigger)}>
        <span {...stylex.props(styles.pageName)}>{current?.name ?? page}</span>
        <ChevronDown size={13} />
      </button>
    </DropdownMenu>
  );
}

interface Props extends PageSwitcherProps {
  title: string;
  artifact: string | null;
  live?: boolean;
}

export function PhoneArtboardBar({ title, pages, page, onPageChange, artifact, live }: Props) {
  return (
    <header data-chrome {...stylex.props(styles.bar)}>
      <span {...stylex.props(styles.title)}>{title}</span>
      <PageSwitcher pages={pages} page={page} onPageChange={onPageChange} />
      <span {...stylex.props(styles.spacer)} />
      {live === undefined ? null : <i title={live ? t('chrome.live') : t('chrome.reconnecting')} {...stylex.props(styles.dot, live && styles.dotOn)} />}
      {artifact ? <PublishMenu artifact={artifact} /> : null}
    </header>
  );
}
