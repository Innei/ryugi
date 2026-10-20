import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { $getRoot, type LexicalEditor } from 'lexical';
import { useEffect, useState } from 'react';

interface Entry {
  key: string;
  text: string;
  depth: number;
}

const styles = stylex.create({
  toc: { position: 'sticky', top: 72, alignSelf: 'start', fontFamily: cssVar.fontFamily, fontSize: 12, lineHeight: 2.1, color: cssVar.colorTextTertiary },
  label: { marginBottom: 4, color: cssVar.colorTextSecondary, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' },
  item: {
    display: 'block',
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: 0,
    paddingInlineStart: 10,
    marginInlineStart: -12,
    borderWidth: 0,
    borderInlineStartWidth: 2,
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: 'transparent',
    backgroundColor: 'transparent',
    color: { default: 'inherit', ':hover': cssVar.colorText },
    font: 'inherit',
    textAlign: 'start',
    cursor: 'pointer',
  },
  nested: { paddingInlineStart: 22 },
  active: { color: cssVar.colorText, fontWeight: 500, borderInlineStartColor: cssVar.colorText },
});

const HEADING_DEPTH: Record<string, number> = { h2: 0, h3: 1 };

export function DocumentToc({ editor }: { editor: LexicalEditor | null }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (!editor) return;
    const read = () =>
      setEntries(
        editor.getEditorState().read(() =>
          $getRoot()
            .getChildren()
            .filter((block) => block.getType() === 'heading' && (block as unknown as { getTag(): string }).getTag() in HEADING_DEPTH)
            .map((block) => ({
              key: block.getKey(),
              text: block.getTextContent(),
              depth: HEADING_DEPTH[(block as unknown as { getTag(): string }).getTag()]!,
            })),
        ),
      );
    read();
    return editor.registerUpdateListener(read);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const onScroll = () => {
      let current: string | null = entries[0]?.key ?? null;
      for (const entry of entries) {
        const element = editor.getElementByKey(entry.key);
        if (element && element.getBoundingClientRect().top < 120) current = entry.key;
      }
      setActiveKey(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [editor, entries]);

  if (entries.length === 0) return <nav {...stylex.props(styles.toc)} />;
  return (
    <nav aria-label="目录" {...stylex.props(styles.toc)}>
      <div {...stylex.props(styles.label)}>目录</div>
      {entries.map((entry) => (
        <button
          key={entry.key}
          type="button"
          onClick={() => editor?.getElementByKey(entry.key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          {...stylex.props(styles.item, entry.depth > 0 && styles.nested, entry.key === activeKey && styles.active)}
        >
          {entry.text}
        </button>
      ))}
    </nav>
  );
}
