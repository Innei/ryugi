import { useColorScheme } from '@haklex/rich-editor';
import type { MermaidRendererProps } from '@haklex/rich-editor/renderers';
import { MermaidRenderer } from '@haklex/rich-renderer-mermaid';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { ZoomIn } from 'lucide-react';
import { useRef, useState } from 'react';

import { t } from '../i18n';
import { headingAbove, useMermaidDiagram } from './mermaid';
import { openMermaidViewer } from './MermaidViewer';

const styles = stylex.create({
  root: {
    position: 'relative',
    marginBlock: 16,
    cursor: 'zoom-in',
    outlineWidth: 1,
    outlineStyle: 'solid',
    outlineColor: 'transparent',
    outlineOffset: 6,
    transitionProperty: 'outline-color',
    transitionDuration: '150ms',
  },
  hovered: { outlineColor: cssVar.colorBorder },
  image: { display: 'block', maxWidth: '100%', height: 'auto', marginInline: 'auto' },
  hint: {
    position: 'absolute',
    top: 'calc(100% + 10px)',
    right: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    lineHeight: 1,
    color: cssVar.colorTextSecondary,
    opacity: 0,
    pointerEvents: 'none',
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
  },
  hintShown: { opacity: 1 },
});

export function MermaidPreview({ content }: MermaidRendererProps) {
  const colorScheme = useColorScheme();
  const diagram = useMermaidDiagram(content, colorScheme);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (!diagram) return <MermaidRenderer colorScheme={colorScheme} content={content} />;

  const open = () =>
    openMermaidViewer({
      source: content,
      diagram,
      title: headingAbove(ref.current) ?? t('mermaid.diagram'),
    });

  return (
    <div
      aria-label={t('mermaid.open')}
      ref={ref}
      role="button"
      tabIndex={0}
      onBlur={() => setFocused(false)}
      onClick={open}
      onFocus={(event) => setFocused(event.currentTarget.matches(':focus-visible'))}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onKeyDownCapture={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        // Lexical's native keydown listener on the contenteditable would otherwise also see the key and split a paragraph at the last caret.
        event.preventDefault();
        event.stopPropagation();
        open();
      }}
      {...stylex.props(styles.root, hovered && styles.hovered)}
    >
      <img
        alt="Mermaid diagram"
        draggable={false}
        height={diagram.height}
        src={diagram.src}
        width={diagram.width}
        {...stylex.props(styles.image)}
      />
      <span {...stylex.props(styles.hint, (hovered || focused) && styles.hintShown)}>
        <ZoomIn size={12} />
        {t('mermaid.clickToEnlarge')}
      </span>
    </div>
  );
}
