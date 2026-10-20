import { CopyButton, Popover } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { ArrowRight, Globe, Lock } from 'lucide-react';
import { useState } from 'react';
import type { Visibility } from '../../shared/cloud';
import { changeVisibility, INSTALL_URL } from '../lib/cloud-shell';
import { RyugiMark } from './RyugiMark';

const NARROW = '@media (max-width: 640px)';

const styles = stylex.create({
  bar: {
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingInline: '12px 10px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    backgroundColor: cssVar.colorBgLayout,
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
  },
  name: { fontSize: 13, fontWeight: 600, letterSpacing: '-0.4px', marginInlineStart: -2 },
  tag: { color: cssVar.colorTextTertiary, whiteSpace: 'nowrap', display: { default: 'inline', [NARROW]: 'none' } },
  spacer: { flex: 1 },
  cta: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    color: { default: cssVar.colorText, ':hover': cssVar.colorTextSecondary },
    fontWeight: 500,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    paddingBlock: 2,
    paddingInline: 8,
    borderRadius: 999,
    backgroundColor: cssVar.colorFillTertiary,
    color: cssVar.colorTextSecondary,
    fontSize: 11,
    whiteSpace: 'nowrap',
  },
  share: {
    paddingBlock: 3,
    paddingInline: 10,
    borderWidth: 0,
    borderRadius: 5,
    backgroundColor: { default: cssVar.colorText, ':hover': cssVar.colorTextSecondary },
    color: cssVar.colorBgLayout,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    cursor: 'pointer',
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

function Brand({ tag }: { tag: string }) {
  return (
    <>
      <RyugiMark size={16} />
      <span {...stylex.props(styles.name)}>ryugi</span>
      <span {...stylex.props(styles.tag)}>· {tag}</span>
      <span {...stylex.props(styles.spacer)} />
    </>
  );
}

export function VisitorBanner() {
  return (
    <header {...stylex.props(styles.bar)}>
      <Brand tag="让 agent 把方案画给你看" />
      <a href={INSTALL_URL} target="_blank" rel="noopener noreferrer" {...stylex.props(styles.cta)}>
        开始使用
        <ArrowRight size={12} />
      </a>
    </header>
  );
}

export function OwnerBanner({ id, visibility, onChange }: { id: string; visibility: Visibility; onChange: (next: Visibility) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const url = `${location.origin}/a/${id}`;
  const current = OPTIONS.find((option) => option.value === visibility)!;

  const choose = async (next: Visibility) => {
    if (next === visibility || saving) return;
    setSaving(true);
    setError(null);
    try {
      onChange(await changeVisibility(id, next));
    } catch (err) {
      setError((err as Error).message);
    }
    setSaving(false);
  };

  const panel = (
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
        <CopyButton content={url} size="small" />
      </div>
      {error ? <p {...stylex.props(styles.error)}>{error}</p> : <p {...stylex.props(styles.foot)}>改动立即生效，链接不变。</p>}
    </div>
  );

  return (
    <header {...stylex.props(styles.bar)}>
      <Brand tag="你的 artifact" />
      <span {...stylex.props(styles.chip)}>
        <current.Icon size={11} />
        {current.label}可见
      </span>
      <Popover placement="bottomRight" trigger="click" content={panel}>
        <button type="button" {...stylex.props(styles.share)}>
          分享
        </button>
      </Popover>
    </header>
  );
}
