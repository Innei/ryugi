import { Button } from '@lobehub/ui';
import { useTranslation } from '../i18n';

const deleteButtonStyle = { backgroundColor: 'var(--lobe-color-error-active)', color: '#fff' };

export function CloudSelectionBar({ count, busy, retry, blocked, onCancel, onDelete }: { count: number; busy: boolean; retry: boolean; blocked: boolean; onCancel: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="cloud-selection-bar" role="toolbar" aria-label={t('cloudLibrary.selected', { count })}>
      <span className="cloud-strong" role="status">{t('cloudLibrary.selected', { count })}</span>
      <span className="cloud-grow" />
      <Button size="small" type="text" disabled={busy} onClick={onCancel}>{t('common.cancel')}</Button>
      <Button size="small" danger type="primary" style={deleteButtonStyle} loading={busy} disabled={count === 0 || busy || blocked} onClick={onDelete}>
        {retry ? t('cloudLibrary.retryDelete') : t('cloudLibrary.deleteCount', { count })}
      </Button>
    </div>
  );
}
