import { Button, CopyButton, Popover, Segmented } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Globe, Lock } from 'lucide-react';
import { useState } from 'react';
import { ownLink, publishState, type Visibility } from '../../shared/cloud';
import { cloudRequest, useCloudStatus, type CloudResult } from '../hooks/useCloudStatus';

const styles = stylex.create({
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingInline: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorderSecondary,
    borderRadius: 8,
    backgroundColor: { default: cssVar.colorBgElevated, ':hover': cssVar.colorFillTertiary },
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  floating: { position: 'fixed', top: 12, right: 12, zIndex: 10, boxShadow: cssVar.boxShadowTertiary },
  panel: { display: 'flex', flexDirection: 'column', gap: 12, width: 320, fontFamily: cssVar.fontFamily, fontSize: 12 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  muted: { color: cssVar.colorTextSecondary, lineHeight: 1.6 },
  link: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: cssVar.fontFamilyCode,
    fontSize: 11,
    color: cssVar.colorLink,
  },
  textButton: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: cssVar.colorTextTertiary,
    fontSize: 11,
    cursor: 'pointer',
  },
  danger: { color: cssVar.colorError },
  error: { margin: 0, paddingInlineStart: 18, color: cssVar.colorError, lineHeight: 1.6 },
  warning: { color: cssVar.colorWarningText },
});

const VISIBILITY_HINT: Record<Visibility, string> = {
  private: '只有你登录后能打开链接',
  public: '拿到链接的人都能打开，不需要登录',
};

interface Props {
  artifact: string;
  floating?: boolean;
}

export function PublishMenu({ artifact, floating = false }: Props) {
  const { status, refresh, login, waitingForLogin } = useCloudStatus();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const state = publishState(status?.artifacts[artifact]);

  const run = async (action: () => Promise<CloudResult>) => {
    setBusy(true);
    setErrors([]);
    const result = await action();
    if (result.status === 401) void login(result.json.loginUrl as string | undefined);
    else if (!result.ok) {
      const reasons = Array.isArray(result.json.reasons) ? (result.json.reasons as string[]) : [];
      setErrors([String(result.json.error ?? `请求失败（${result.status}）`), ...reasons]);
    }
    await refresh();
    setBusy(false);
  };

  const setVisibility = (visibility: Visibility) => run(() => cloudRequest('POST', `visibility/${artifact}`, { visibility }));

  const adoptCloudVisibility = async (open: boolean) => {
    if (!open || !status?.signedIn || !state.published) return;
    if ((await cloudRequest('GET', 'artifacts')).ok) await refresh();
  };

  const content = !status ? (
    <div {...stylex.props(styles.panel, styles.muted)}>正在读取发布状态…</div>
  ) : !status.signedIn ? (
    <div {...stylex.props(styles.panel)}>
      <span {...stylex.props(styles.muted)}>登录 Ryugi Cloud 后，可以把这个 artifact 发布成一个链接分享给别人。</span>
      <Button type="primary" loading={waitingForLogin} onClick={() => void login()}>
        {waitingForLogin ? '等待浏览器完成登录…' : '用 GitHub 登录'}
      </Button>
    </div>
  ) : (
    <div {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.row)}>
        <span {...stylex.props(styles.muted)}>已登录：{status.login}</span>
        <button type="button" {...stylex.props(styles.textButton)} onClick={() => void run(() => cloudRequest('POST', 'logout'))}>
          退出登录
        </button>
      </div>
      <Segmented
        block
        disabled={busy}
        value={state.visibility}
        options={[
          { label: '私有', value: 'private' },
          { label: '公开', value: 'public' },
        ]}
        onChange={(value) => void setVisibility(value as Visibility)}
      />
      <span {...stylex.props(styles.muted)}>{VISIBILITY_HINT[state.visibility]}</span>
      {state.url ? (
        <div {...stylex.props(styles.row)}>
          <a href={ownLink(state.url, status.hostId)} target="_blank" rel="noreferrer" {...stylex.props(styles.link)}>
            {state.url}
          </a>
          <CopyButton content={state.url} size="small" />
        </div>
      ) : null}
      {!state.synced ? (
        <div {...stylex.props(styles.row, styles.warning)}>
          <span>本地可见性还没同步到云端</span>
          <Button size="small" disabled={busy} onClick={() => void setVisibility(state.visibility)}>
            同步
          </Button>
        </div>
      ) : null}
      {errors.length > 0 ? (
        <ul {...stylex.props(styles.error)}>
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <Button type="primary" loading={busy} onClick={() => void run(() => cloudRequest('POST', `publish/${artifact}`))}>
        {state.published ? '更新发布内容' : '发布'}
      </Button>
      {state.published ? (
        <button
          type="button"
          disabled={busy}
          {...stylex.props(styles.textButton, styles.danger)}
          onClick={() => void run(() => cloudRequest('DELETE', `publish/${artifact}`))}
        >
          取消发布（链接将失效）
        </button>
      ) : null}
      {state.published && status.autoPublish?.enabled ? (
        <span {...stylex.props(styles.muted)}>自动发布已打开。取消发布后它会跳过这个 artifact，直到你再手动发布一次。</span>
      ) : null}
    </div>
  );

  return (
    <Popover placement="bottomRight" trigger="click" content={content} onOpenChange={(open) => void adoptCloudVisibility(open)}>
      <button type="button" aria-label="Share" {...stylex.props(styles.trigger, floating && styles.floating)}>
        {state.published && state.visibility === 'public' ? <Globe size={14} /> : <Lock size={14} />}
        {state.published ? '已发布' : '分享'}
      </button>
    </Popover>
  );
}
