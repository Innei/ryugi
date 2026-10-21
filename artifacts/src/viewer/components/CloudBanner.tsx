import { Popover } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { ArrowRight, CircleAlert, Copy, Globe, Lock, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import type { Visibility } from '../../shared/cloud';
import type { ArtifactType } from '../../shared/types';
import type { CloudHeaderState } from '../hooks/useCloudHeader';
import { changeVisibility, CloudRequestError, INSTALL_URL } from '../lib/cloud-shell';
import { RyugiMark } from './RyugiMark';

const NARROW = '@media (max-width: 640px)';

const styles = stylex.create({
  bar: {
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: { default: 24, [NARROW]: 12 },
    height: 56,
    paddingInline: { default: 24, [NARROW]: 12 },
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    backgroundColor: cssVar.colorBgLayout,
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
  },
  left: { display: 'flex', alignItems: 'center', gap: 20, minWidth: 0, flex: 1 },
  brand: { display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, minHeight: 40, color: { default: cssVar.colorText, ':hover': cssVar.colorTextSecondary }, textDecoration: 'none', borderRadius: 5 },
  name: { fontSize: 15, fontWeight: 600, letterSpacing: '-0.4px', marginInlineStart: -2 },
  crumb: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap' },
  slash: { color: cssVar.colorTextTertiary },
  type: { display: { default: 'contents', [NARROW]: 'none' }, color: cssVar.colorTextSecondary },
  title: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 },
  actions: { display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 },
  statuses: { display: { default: 'flex', [NARROW]: 'none' }, alignItems: 'center', gap: 16, color: cssVar.colorTextSecondary },
  status: { display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  dot: { width: 6, height: 6, borderRadius: '50%', backgroundColor: cssVar.colorTextQuaternary },
  online: { backgroundColor: cssVar.colorSuccess },
  activity: { maxWidth: 160, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: cssVar.colorInfoText },
  retrying: { color: cssVar.colorWarningText, whiteSpace: 'nowrap' },
  divider: { width: 1, height: 18, backgroundColor: cssVar.colorBorderSecondary },
  visibilityLabel: { display: { default: 'inline', [NARROW]: 'none' } },
  cta: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    color: { default: cssVar.colorText, ':hover': cssVar.colorTextSecondary },
    fontWeight: 500,
    minHeight: 40,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    paddingBlock: 5,
    paddingInline: 9,
    borderRadius: 999,
    backgroundColor: cssVar.colorFillTertiary,
    color: cssVar.colorTextSecondary,
    fontSize: 11,
    whiteSpace: 'nowrap',
  },
  share: {
    position: 'relative',
    height: 28,
    paddingBlock: 0,
    paddingInline: 14,
    borderWidth: 0,
    borderRadius: 5,
    backgroundColor: { default: cssVar.colorText, ':hover': cssVar.colorTextSecondary },
    color: cssVar.colorBgLayout,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    cursor: 'pointer',
    '::before': { content: '""', position: 'absolute', insetBlock: -6, insetInline: 0 },
  },
  panel: { display: 'flex', flexDirection: 'column', gap: 2, width: 'min(288px, calc(100vw - 16px))', fontFamily: cssVar.fontFamily, fontSize: 12 },
  heading: { margin: '2px 4px 6px', fontSize: 12, fontWeight: 600 },
  options: { display: 'flex', flexDirection: 'column', gap: 2 },
  option: {
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    gap: 8,
    padding: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 7,
    backgroundColor: { default: 'transparent', ':hover': cssVar.colorFillQuaternary },
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    textAlign: 'start',
    cursor: 'pointer',
  },
  optionOn: { borderColor: cssVar.colorBorder, backgroundColor: cssVar.colorFillQuaternary },
  icon: { display: 'grid', placeItems: 'center', flex: 'none', width: 24, height: 24, borderRadius: 6, backgroundColor: cssVar.colorFillTertiary },
  label: { display: 'block', fontSize: 12, fontWeight: 600, lineHeight: 1.3 },
  hint: { display: 'block', color: cssVar.colorTextTertiary, fontSize: 11, lineHeight: 1.3 },
  link: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 },
  url: {
    flex: 1,
    minWidth: 0,
    paddingBlock: 5,
    paddingInline: 8,
    borderRadius: 5,
    backgroundColor: cssVar.colorFillQuaternary,
    color: cssVar.colorTextSecondary,
    fontFamily: cssVar.fontFamilyCode,
    fontSize: 11,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  foot: { margin: '6px 4px 0', color: cssVar.colorTextTertiary, fontSize: 11 },
  error: { margin: '6px 4px 0', color: cssVar.colorError, fontSize: 11 },
});

const OPTIONS: { value: Visibility; label: string; hint: string; Icon: typeof Lock }[] = [
  { value: 'private', label: '仅自己', hint: '登录后只有你能打开', Icon: Lock },
  { value: 'public', label: '有链接的人', hint: '不用登录，拿到链接就能看', Icon: Globe },
];

interface Props {
  id: string;
  type: ArtifactType | null;
  title: string;
  owner: boolean;
  status: CloudHeaderState;
  visibility: Visibility;
  onChange: (next: Visibility) => void;
}

export function CloudHeader({ id, type, title, owner, status, visibility, onChange }: Props) {
  return (
    <header {...stylex.props(styles.bar)}>
      <div {...stylex.props(styles.left)}>
        <a href="/" aria-label="返回 Ryugi Cloud 列表" {...stylex.props(styles.brand)}>
          <RyugiMark size={24} />
          <span {...stylex.props(styles.name)}>ryugi</span>
        </a>
        <nav aria-label="面包屑" {...stylex.props(styles.crumb)}>
          <span aria-hidden="true" {...stylex.props(styles.slash)}>/</span>
          {type ? <span {...stylex.props(styles.type)}>{type}<span aria-hidden="true" {...stylex.props(styles.slash)}> / </span></span> : null}
          <span aria-current="page" title={title} {...stylex.props(styles.title)}>{title}</span>
        </nav>
      </div>
      <div {...stylex.props(styles.actions)}>
        <div {...stylex.props(styles.statuses)}>
          {status.activity ? <span title={status.activity} {...stylex.props(styles.activity)}>{status.activity}</span> : null}
          {status.retrying ? <span role="status" {...stylex.props(styles.retrying)}>未同步，正在重试</span> : null}
          {status.reason ? <CircleAlert size={14} aria-label={status.reason} /> : null}
          {status.online !== undefined ? (
            <span role="status" title={status.reason || (status.online === false ? '电脑离线，暂时不能评论' : undefined)} {...stylex.props(styles.status)}>
              <i aria-hidden="true" {...stylex.props(styles.dot, status.online === true && styles.online)} />
              {status.online === null ? '正在连接…' : status.online ? '电脑在线' : '电脑离线'}
            </span>
          ) : null}
          {status.comments !== undefined ? <span {...stylex.props(styles.status)}><MessageCircle size={14} aria-hidden="true" />评论 {status.comments}</span> : null}
          {(status.online !== undefined || status.comments !== undefined) && owner ? <span aria-hidden="true" {...stylex.props(styles.divider)} /> : null}
        </div>
        {owner ? <OwnerActions id={id} visibility={visibility} onChange={onChange} /> : (
          <a href={INSTALL_URL} target="_blank" rel="noopener noreferrer" {...stylex.props(styles.cta)}>
            开始使用<ArrowRight size={12} />
          </a>
        )}
      </div>
    </header>
  );
}

export function CloudSharePanel({ id, visibility, onChange }: { id: string; visibility: Visibility; onChange: (next: Visibility) => void }) {
  const [error, setError] = useState<{ message: string; auth?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/a/${id}`;

  const choose = async (next: Visibility) => {
    if (next === visibility || saving) return;
    setSaving(true);
    setError(null);
    try {
      onChange(await changeVisibility(id, next));
    } catch (err) {
      setError({ message: (err as Error).message, auth: err instanceof CloudRequestError && err.status === 401 });
    }
    setSaving(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError(null);
    } catch {
      setError({ message: '复制失败，请手动复制链接。' });
    }
  };

  return (
    <div {...stylex.props(styles.panel)}>
      <p {...stylex.props(styles.heading)}>谁能看到这个链接</p>
      <div role="radiogroup" aria-label="谁能看到这个链接" {...stylex.props(styles.options)}>
        {OPTIONS.map(({ value, label, hint, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === visibility}
            disabled={saving}
            onClick={() => void choose(value)}
            {...stylex.props(styles.option, value === visibility && styles.optionOn)}
          >
            <span {...stylex.props(styles.icon)}>
              <Icon size={12} />
            </span>
            <span>
              <span {...stylex.props(styles.label)}>{label}</span>
              <span {...stylex.props(styles.hint)}>{hint}</span>
            </span>
          </button>
        ))}
      </div>
      <div {...stylex.props(styles.link)}>
        <span {...stylex.props(styles.url)}>{url.replace(/^https?:\/\//, '')}</span>
        <button type="button" onClick={() => void copy()} {...stylex.props(styles.share)}><Copy size={12} /> {copied ? '已复制' : '复制'}</button>
      </div>
      {error ? <p role="alert" {...stylex.props(styles.error)}>{error.auth ? '登录已过期，请重新登录。' : error.message} {error.auth && <a href={`/auth/login?return=${encodeURIComponent(location.pathname)}`}>重新登录</a>}</p> : <p {...stylex.props(styles.foot)}>{visibility === 'private' ? '复制不会自动公开。' : ''}改动立即生效，链接不变。</p>}
    </div>
  );
}

function OwnerActions({ id, visibility, onChange }: { id: string; visibility: Visibility; onChange: (next: Visibility) => void }) {
  const current = OPTIONS.find((option) => option.value === visibility)!;

  return (
    <>
      <span title={`${current.label}可见`} {...stylex.props(styles.chip)}>
        <current.Icon size={11} />
        <span {...stylex.props(styles.visibilityLabel)}>{current.label}可见</span>
      </span>
      <Popover placement="bottomRight" trigger="click" content={<CloudSharePanel id={id} visibility={visibility} onChange={onChange} />}>
        <button type="button" {...stylex.props(styles.share)}>
          分享
        </button>
      </Popover>
    </>
  );
}
