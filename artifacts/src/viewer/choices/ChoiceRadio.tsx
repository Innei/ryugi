import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import type { Ref } from 'react';

import { useTranslation } from '../i18n';
import { brand } from '../tokens.stylex';

const styles = stylex.create({
  radio: {
    flexShrink: 0,
    width: 14,
    height: 14,
    marginTop: 4,
    marginInlineEnd: 6,
    padding: 0,
    boxSizing: 'border-box',
    borderRadius: '50%',
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: { 'default': cssVar.colorTextQuaternary, ':hover': brand.accent },
    backgroundColor: cssVar.colorBgContainer,
    cursor: 'pointer',
  },
  on: { borderWidth: 4.5, borderColor: brand.accent },
  off: { cursor: 'default', opacity: 0.6 },
});

interface Props {
  board: string;
  checked: boolean;
  disabled: boolean;
  onChoose: (board: string) => void;
  radioRef?: Ref<HTMLButtonElement>;
}

export function ChoiceRadio({ board, checked, disabled, onChoose, radioRef }: Props) {
  const { t } = useTranslation();
  return (
    <button
      aria-checked={checked}
      aria-label={t('choices.chooseBoard', { id: board })}
      data-choice-radio={board}
      disabled={disabled}
      ref={radioRef}
      role="radio"
      type="button"
      onClick={() => onChoose(board)}
      {...stylex.props(styles.radio, checked && styles.on, disabled && styles.off)}
    />
  );
}
