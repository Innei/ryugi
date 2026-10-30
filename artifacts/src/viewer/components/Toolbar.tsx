import { ActionIcon, DropdownMenu, Popover } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import {
  Check,
  ChevronDown,
  Hand,
  MessageCirclePlus,
  MousePointer2,
  PanelRight,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { PageSpec } from '../../shared/types';
import type { Tool } from '../hooks/usePanZoom';
import { useTranslation } from '../i18n';
import { color } from '../tokens.stylex';

const styles = stylex.create({
  bar: {
    position: 'absolute',
    top: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    height: 40,
    paddingInline: 4,
    backgroundColor: cssVar.colorBgElevated,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorderSecondary,
    borderRadius: 10,
    boxShadow: cssVar.boxShadowTertiary,
    fontSize: 13,
    color: cssVar.colorText,
    zIndex: 10,
  },
  left: { left: 10 },
  right: { right: 10 },
  divider: { width: 1, height: 16, marginInline: 4, backgroundColor: cssVar.colorBorderSecondary },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingInline: 8,
    borderWidth: 0,
    borderRadius: 6,
    backgroundColor: { 'default': 'transparent', ':hover': cssVar.colorFillTertiary },
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  pageName: { fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' },
  chevron: { color: cssVar.colorTextTertiary },
  zoom: { fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right' },
  live: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 30 },
  progress: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingInline: 6,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: cssVar.colorTextSecondary,
    fontFamily: cssVar.fontFamily,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  progressIcon: { color: color.success },
  dot: { width: 7, height: 7, borderRadius: '50%', backgroundColor: cssVar.colorTextTertiary },
  dotOn: {
    backgroundColor: cssVar.colorSuccess,
    outlineWidth: 3,
    outlineStyle: 'solid',
    outlineColor: color.successWash,
  },
  warnButton: {
    height: 26,
    paddingInline: 8,
    borderWidth: 0,
    borderRadius: 6,
    backgroundColor: cssVar.colorWarningBg,
    color: cssVar.colorWarningText,
    fontWeight: 500,
    cursor: 'pointer',
  },
  warnList: {
    margin: 0,
    paddingBlock: 4,
    paddingInlineStart: 18,
    maxWidth: 420,
    fontSize: 13,
    lineHeight: 1.6,
  },
  hint: { color: cssVar.colorTextTertiary, fontFamily: cssVar.fontFamilyCode, fontSize: 12 },
});

interface TopLeftBarProps {
  commenting?: boolean;
  onPageChange: (id: string) => void;
  onToolChange: (tool: Tool) => void;
  page: string | null;
  pages: PageSpec[];
  tool: Tool;
}

export function TopLeftBar({
  pages,
  page,
  onPageChange,
  tool,
  onToolChange,
  commenting = false,
}: TopLeftBarProps) {
  const { t } = useTranslation();
  const current = pages.find((p) => p.id === page);
  return (
    <div data-chrome {...stylex.props(styles.bar, styles.left)}>
      <DropdownMenu
        placement="bottomLeft"
        items={pages.map((p) => ({
          key: p.id,
          label: p.name,
          icon: p.id === page ? Check : undefined,
          onClick: () => onPageChange(p.id),
        }))}
      >
        <button aria-label={t('chrome.switchPage')} type="button" {...stylex.props(styles.trigger)}>
          <span {...stylex.props(styles.pageName)}>{current?.name ?? t('chrome.noPages')}</span>
          <ChevronDown size={14} {...stylex.props(styles.chevron)} />
        </button>
      </DropdownMenu>
      <span {...stylex.props(styles.divider)} />
      <ActionIcon
        active={tool === 'select'}
        aria-label={t('chrome.select')}
        icon={MousePointer2}
        size="small"
        title={t('chrome.selectTitle')}
        onClick={() => onToolChange('select')}
      />
      <ActionIcon
        active={tool === 'hand'}
        aria-label={t('chrome.hand')}
        icon={Hand}
        size="small"
        title={t('chrome.handTitle')}
        onClick={() => onToolChange('hand')}
      />
      {commenting ? (
        <ActionIcon
          active={tool === 'comment'}
          aria-label={t('chrome.comment')}
          icon={MessageCirclePlus}
          size="small"
          title={t('chrome.commentTitle')}
          onClick={() => onToolChange('comment')}
        />
      ) : null}
    </div>
  );
}

interface TopRightBarProps {
  actions?: ReactNode;
  inspectorOpen: boolean;
  live?: boolean;
  onActualSize: () => void;
  onFit: () => void;
  onNextVerify?: () => void;
  onToggleInspector: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  verify?: { passed: number; total: number };
  warnings: string[];
  zoom: number;
}

export function TopRightBar({
  actions,
  live,
  warnings,
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onActualSize,
  inspectorOpen,
  onToggleInspector,
  verify,
  onNextVerify,
}: TopRightBarProps) {
  const { t } = useTranslation();
  const hint = (text: string) => <span {...stylex.props(styles.hint)}>{text}</span>;
  return (
    <div data-chrome {...stylex.props(styles.bar, styles.right)}>
      {verify && verify.total > 0 && (
        <>
          <button
            title={t('verdict.nextPending')}
            type="button"
            onClick={onNextVerify}
            {...stylex.props(styles.progress)}
          >
            <Check size={13} {...stylex.props(styles.progressIcon)} />
            {t('verdict.progress', { passed: verify.passed, total: verify.total })}
          </button>
          <span {...stylex.props(styles.divider)} />
        </>
      )}
      {live === undefined ? null : (
        <span
          {...stylex.props(styles.live)}
          title={live ? t('chrome.live') : t('chrome.reconnecting')}
        >
          <span {...stylex.props(styles.dot, live && styles.dotOn)} />
        </span>
      )}
      {warnings.length > 0 && (
        <Popover
          placement="bottomRight"
          content={
            <ul {...stylex.props(styles.warnList)}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          }
        >
          <button type="button" {...stylex.props(styles.warnButton)}>
            {t('chrome.warnings', { count: warnings.length })}
          </button>
        </Popover>
      )}
      <span {...stylex.props(styles.divider)} />
      <ActionIcon
        active={inspectorOpen}
        aria-label={t('chrome.toggleInspector')}
        aria-pressed={inspectorOpen}
        icon={PanelRight}
        size="small"
        title={t('chrome.inspector')}
        onClick={onToggleInspector}
      />
      <DropdownMenu
        placement="bottomRight"
        items={[
          { key: 'in', label: t('chrome.zoomIn'), extra: hint('⌘ +'), onClick: onZoomIn },
          { key: 'out', label: t('chrome.zoomOut'), extra: hint('⌘ −'), onClick: onZoomOut },
          { key: 'fit', label: t('chrome.zoomFit'), extra: hint('⇧ 1'), onClick: onFit },
          {
            key: 'actual',
            label: t('chrome.zoomActual'),
            extra: hint('⇧ 0'),
            onClick: onActualSize,
          },
        ]}
      >
        <button aria-label={t('chrome.zoom')} type="button" {...stylex.props(styles.trigger)}>
          <span {...stylex.props(styles.zoom)}>{Math.round(zoom * 100)}%</span>
          <ChevronDown size={14} {...stylex.props(styles.chevron)} />
        </button>
      </DropdownMenu>
      {actions ? (
        <>
          <span {...stylex.props(styles.divider)} />
          {actions}
        </>
      ) : null}
    </div>
  );
}
