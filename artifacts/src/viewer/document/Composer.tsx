import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const styles = stylex.create({
  composer: { position: 'relative', paddingTop: 2, paddingInline: 14, paddingBottom: 12 },
  unsent: { marginBottom: 6, color: cssVar.colorWarningText, fontFamily: cssVar.fontFamily, fontSize: 11 },
  input: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 44,
    padding: 0,
    paddingInlineEnd: 36,
    borderWidth: 0,
    outline: 'none',
    backgroundColor: 'transparent',
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    lineHeight: 1.6,
    resize: 'none',
    fieldSizing: 'content',
  },
  send: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 28,
    height: 28,
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    borderWidth: 0,
    borderRadius: '50%',
    backgroundColor: cssVar.colorText,
    color: cssVar.colorBgContainer,
    cursor: { default: 'pointer', ':disabled': 'default' },
    opacity: { default: 1, ':disabled': 0.35 },
  },
});

interface ComposerProps {
  placeholder: string;
  initial?: string;
  autoFocus?: boolean;
  focusKey?: number;
  onSubmit: (text: string) => void | Promise<boolean>;
  onCancel?: () => void;
  onChange?: (text: string) => void;
}

export function Composer({ placeholder, initial = '', autoFocus, focusKey, onSubmit, onCancel, onChange }: ComposerProps) {
  const [text, setText] = useState(initial);
  const [unsent, setUnsent] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusKey) input.current?.focus({ preventScroll: true });
  }, [focusKey]);
  const update = (next: string) => {
    setText(next);
    onChange?.(next);
  };
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    const sent = onSubmit(value);
    update('');
    setUnsent(false);
    void sent?.then((ok) => {
      if (ok) return;
      update(value);
      setUnsent(true);
    });
  };
  return (
    <div {...stylex.props(styles.composer)} onClick={(event) => event.stopPropagation()}>
      {unsent ? <div {...stylex.props(styles.unsent)}>没发出去：电脑离线了，文字还在这里</div> : null}
      <textarea
        ref={input}
        autoFocus={autoFocus}
        value={text}
        rows={1}
        placeholder={placeholder}
        onChange={(event) => update(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
          if (event.key === 'Escape') onCancel?.();
        }}
        {...stylex.props(styles.input)}
      />
      <button type="button" aria-label="发送" title="发送 ⌘↵" disabled={!text.trim()} onClick={submit} {...stylex.props(styles.send)}>
        <ArrowUp size={15} strokeWidth={2.4} />
      </button>
    </div>
  );
}
