import { Avatar, Button, DropdownMenu } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { LogOut, Settings } from 'lucide-react';

import type { CloudStatus } from '../../shared/cloud';
import { cloudRequest, useCloudStatus } from '../hooks/useCloudStatus';
import { useTranslation } from '../i18n';
import { openSettings } from '../lib/settings-dialog';

const styles = stylex.create({
  trigger: {
    display: 'flex',
    padding: 0,
    borderWidth: 0,
    borderRadius: '50%',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    outlineOffset: 2,
  },
  avatar: { boxShadow: `0 0 0 1px ${cssVar.colorBorderSecondary}` },
});

interface Props {
  onSignIn: () => void;
  onSignOut?: () => Promise<void>;
  status: CloudStatus | null;
  waitingForLogin?: boolean;
}

export function AccountMenuButton({ status, waitingForLogin, onSignIn, onSignOut }: Props) {
  const { t } = useTranslation();
  if (!status) return null;
  if (!status.signedIn || !status.login)
    return (
      <Button loading={waitingForLogin} size="small" onClick={onSignIn}>
        {t('settings.signIn')}
      </Button>
    );
  const login = status.login;
  return (
    <DropdownMenu
      items={[
        {
          key: 'status',
          disabled: true,
          label: `${login} · ${t('settings.menuStatus', {
            state: status.autoPublish?.enabled ? t('settings.on') : t('settings.off'),
          })}`,
        },
        { key: 'settings', icon: Settings, label: t('settings.open'), onClick: openSettings },
        {
          key: 'sign-out',
          icon: LogOut,
          label: t('settings.signOut'),
          onClick: () => void onSignOut?.(),
        },
      ]}
    >
      <button
        aria-label={t('settings.accountMenu', { login })}
        type="button"
        {...stylex.props(styles.trigger)}
      >
        <Avatar
          alt=""
          avatar={`/api/avatar/github/${login}`}
          shape="circle"
          size={28}
          {...stylex.props(styles.avatar)}
        />
      </button>
    </DropdownMenu>
  );
}

export function AccountMenu() {
  const { status, refresh, login, waitingForLogin } = useCloudStatus();
  return (
    <AccountMenuButton
      status={status}
      waitingForLogin={waitingForLogin}
      onSignIn={() => void login()}
      onSignOut={async () => {
        await cloudRequest('POST', 'logout');
        await refresh();
      }}
    />
  );
}
