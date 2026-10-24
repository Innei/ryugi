import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { ArrowRight, LogIn, LogOut } from 'lucide-react';
import { useState } from 'react';
import { RyugiMark } from '../components/RyugiMark';
import { INSTALL_COMMAND, INSTALL_URL, loginUrl, switchAccount } from '../lib/cloud-shell';
import { brand } from '../tokens.stylex';
import { Trans, useTranslation } from '../i18n';

const NARROW = '@media (max-width: 900px)';

const styles = stylex.create({
  page: {
    position: 'fixed',
    inset: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: { default: 'row', [NARROW]: 'column' },
    alignItems: 'center',
    justifyContent: 'center',
    gap: { default: 72, [NARROW]: 40 },
    paddingBlock: 72,
    paddingInline: 20,
    backgroundColor: cssVar.colorBgLayout,
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
  },
  mark: { position: 'absolute', top: 22, left: 24, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, letterSpacing: '-0.4px' },
  left: { width: 'min(420px, 100%)' },
  title: { margin: '0 0 10px', fontSize: 30, fontWeight: 650 },
  lead: { margin: '0 0 22px', color: cssVar.colorTextSecondary, fontSize: 15, lineHeight: 1.8 },
  line: { margin: 0, color: cssVar.colorText, fontSize: 14, lineHeight: 1.9 },
  inlineLink: { color: brand.accentStrong, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' },
  who: { display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, fontSize: 14, lineHeight: 1.7 },
  avatar: {
    display: 'grid',
    placeItems: 'center',
    flex: 'none',
    width: 28,
    height: 28,
    borderRadius: '50%',
    backgroundColor: brand.accentStrong,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    width: 'fit-content',
    marginTop: 8,
    paddingBlock: 2,
    paddingInline: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorderSecondary,
    borderRadius: 6,
    backgroundColor: { default: 'transparent', ':hover': cssVar.colorFillTertiary },
    color: cssVar.colorTextSecondary,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  error: { margin: '10px 0 0', color: cssVar.colorError, fontSize: 12 },
  promo: {
    width: 'min(440px, 100%)',
    padding: 28,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorderSecondary,
    borderRadius: 18,
    backgroundColor: cssVar.colorFillQuaternary,
  },
  promoTitle: { margin: '14px 0 8px', fontSize: 22, fontWeight: 600 },
  promoText: { margin: '0 0 20px', color: cssVar.colorTextSecondary, fontSize: 14, lineHeight: 1.7 },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 },
  tile: { height: 78, borderWidth: 1, borderStyle: 'solid', borderColor: cssVar.colorBorderSecondary, borderRadius: 8, backgroundColor: cssVar.colorBgContainer },
  tileInk: { backgroundColor: cssVar.colorText },
  code: {
    display: 'block',
    marginBottom: 14,
    paddingBlock: 10,
    paddingInline: 12,
    borderRadius: 8,
    backgroundColor: cssVar.colorText,
    color: cssVar.colorBgLayout,
    fontFamily: cssVar.fontFamilyCode,
    fontSize: 12,
    overflowX: 'auto',
    whiteSpace: 'nowrap',
  },
  go: { display: 'inline-flex', alignItems: 'center', gap: 6, color: cssVar.colorText, fontSize: 14, fontWeight: 600, textDecoration: 'none' },
});

export function CloudNotFound({ id, login }: { id: string; login: string | null }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const switchTo = async () => {
    try {
      location.assign(await switchAccount(id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.mark)}>
        <RyugiMark size={20} />
        ryugi
      </div>
      <section {...stylex.props(styles.left)}>
        <h1 {...stylex.props(styles.title)}>{t('notFound.title')}</h1>
        <p {...stylex.props(styles.lead)}>{t('notFound.lead')}</p>
        <p {...stylex.props(styles.line)}>{t('notFound.fromSomeone')}</p>
        {login ? (
          <div {...stylex.props(styles.who)}>
            <span {...stylex.props(styles.avatar)}>{login.slice(0, 1).toUpperCase()}</span>
            <div>
              <Trans i18nKey="notFound.signedInAs" values={{ login }} components={{ b: <b /> }} />
              <button type="button" onClick={() => void switchTo()} {...stylex.props(styles.button)}>
                <LogOut size={12} />
                {t('notFound.switchAccount')}
              </button>
            </div>
          </div>
        ) : (
          <p {...stylex.props(styles.line)}>
            {t('notFound.yours')}
            <a href={loginUrl(id)} {...stylex.props(styles.inlineLink)}>
              <LogIn size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 3 }} />
              {t('common.signInGithub')}
            </a>
            {t('notFound.signInThen')}
          </p>
        )}
        {error && <p {...stylex.props(styles.error)}>{error}</p>}
      </section>
      <aside {...stylex.props(styles.promo)}>
        <RyugiMark size={32} color={brand.accent} />
        <h2 {...stylex.props(styles.promoTitle)}>{t('notFound.promoTitle')}</h2>
        <p {...stylex.props(styles.promoText)}>{t('notFound.promoText')}</p>
        <div {...stylex.props(styles.tiles)} aria-hidden="true">
          <i {...stylex.props(styles.tile)} />
          <i {...stylex.props(styles.tile, styles.tileInk)} />
          <i {...stylex.props(styles.tile)} />
        </div>
        <code {...stylex.props(styles.code)}>{INSTALL_COMMAND}</code>
        <a href={INSTALL_URL} target="_blank" rel="noopener noreferrer" {...stylex.props(styles.go)}>
          {t('notFound.viewGithub')}
          <ArrowRight size={14} />
        </a>
      </aside>
    </main>
  );
}
