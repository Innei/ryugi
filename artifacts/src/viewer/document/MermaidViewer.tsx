import { createModal, useModalContext } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Check, Copy, Minus, Plus, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import type { MermaidDiagram } from './mermaid';

const NARROW = '@media (max-width: 640px)';

const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: cssVar.fontFamily },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    height: 52,
    paddingInline: { default: '18px 10px', [NARROW]: '12px 4px' },
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
  },
  title: { flexShrink: 0, maxWidth: '40%', fontSize: 14, fontWeight: 600, color: cssVar.colorText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  meta: { flex: 1, minWidth: 0, fontSize: 12, color: cssVar.colorTextQuaternary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  tools: { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingInline: 8,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: { default: cssVar.colorTextTertiary, ':hover': cssVar.colorText },
    fontFamily: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
  },
  percent: { minWidth: 44, textAlign: 'center', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: cssVar.colorTextSecondary },
  divider: { width: 1, height: 18, marginInline: 4, backgroundColor: cssVar.colorBorderSecondary },
  wide: { display: { default: null, [NARROW]: 'none' } },
  stage: { flex: 1, minHeight: 0, cursor: { default: 'grab', ':active': 'grabbing' } },
});

interface ViewerProps {
  title: string;
  source: string;
  diagram: MermaidDiagram;
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} {...stylex.props(styles.button)}>
      {children}
    </button>
  );
}

function MermaidViewer({ title, source, diagram }: ViewerProps) {
  const { close } = useModalContext();
  const [scale, setScale] = useState(1);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard?.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <TransformWrapper
      minScale={0.05}
      maxScale={4}
      limitToBounds={false}
      wheel={{ step: 0.002 }}
      onInit={(ref) => void ref.fitToView({ maxScale: 1, animationTime: 0 })}
      onTransform={(_, state) => setScale(state.scale)}
    >
      {({ zoomIn, zoomOut, fitToView, centerView }) => (
        <div {...stylex.props(styles.root)}>
          <div {...stylex.props(styles.head)}>
            <span {...stylex.props(styles.title)}>{title}</span>
            <span {...stylex.props(styles.meta)}>{`${diagram.type} · ${Math.round(diagram.width)} × ${Math.round(diagram.height)}`}</span>
            <div {...stylex.props(styles.tools)}>
              <ToolButton label="缩小" onClick={() => zoomOut()}><Minus size={16} /></ToolButton>
              <span {...stylex.props(styles.percent)}>{`${Math.round(scale * 100)}%`}</span>
              <ToolButton label="放大" onClick={() => zoomIn()}><Plus size={16} /></ToolButton>
              <span {...stylex.props(styles.divider, styles.wide)} />
              <button type="button" onClick={() => void fitToView({ maxScale: 1 })} {...stylex.props(styles.button, styles.wide)}>适配窗口</button>
              <button type="button" onClick={() => void centerView(1)} {...stylex.props(styles.button, styles.wide)}>原尺寸</button>
              <span {...stylex.props(styles.divider)} />
              <button type="button" aria-label="复制源码" onClick={() => void copy()} {...stylex.props(styles.button)}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span {...stylex.props(styles.wide)}>{copied ? '已复制' : '复制源码'}</span>
              </button>
              <ToolButton label="关闭" onClick={close}><X size={16} /></ToolButton>
            </div>
          </div>
          <TransformComponent wrapperStyle={{ width: '100%', height: '100%', backgroundColor: diagram.background }} wrapperClass={stylex.props(styles.stage).className}>
            <img alt="Mermaid diagram" src={diagram.src} width={diagram.width} height={diagram.height} draggable={false} />
          </TransformComponent>
        </div>
      )}
    </TransformWrapper>
  );
}

export function openMermaidViewer(props: ViewerProps) {
  createModal({
    content: <MermaidViewer {...props} />,
    width: 'calc(100vw - 2 * var(--ryugi-viewer-inset))',
    classNames: { popup: 'ryugi-mermaid-viewer' },
    styles: { content: { height: '100%', padding: 0, overflow: 'hidden' } },
  });
}
