import './styles';
import {
  ALERT_NODE_KEY,
  CODE_BLOCK_NODE_KEY,
  IMAGE_NODE_KEY,
  MERMAID_NODE_KEY,
  RichEditor,
  type RendererConfig,
} from '@haklex/rich-editor';
import { ChartEditNode } from '@haklex/rich-ext-chart';
import { ExcalidrawEditNode, ExcalidrawPlugin } from '@haklex/rich-ext-excalidraw';
import { AlertEditRenderer } from '@haklex/rich-renderer-alert';
import { CodeBlockEditRenderer } from '@haklex/rich-renderer-codeblock';
import { ImageEditRenderer } from '@haklex/rich-renderer-image';
import { katexEditNodes } from '@haklex/rich-renderer-katex';
import { MermaidEditRenderer } from '@haklex/rich-renderer-mermaid';
import type { LexicalEditor } from 'lexical';
import type { LoroDoc } from 'loro-crdt';
import { useState, type ReactNode } from 'react';
import { AgentCaret } from './AgentCaret';
import type { Channel } from './channel';
import { DynamicNode } from './DynamicNode';
import { LoroSync, type AgentCaretPosition } from './LoroSync';

const extraNodes = [ChartEditNode, ExcalidrawEditNode, DynamicNode, ...katexEditNodes];

const rendererConfig: RendererConfig = {
  [ALERT_NODE_KEY]: AlertEditRenderer,
  [CODE_BLOCK_NODE_KEY]: CodeBlockEditRenderer,
  [IMAGE_NODE_KEY]: ImageEditRenderer,
  [MERMAID_NODE_KEY]: MermaidEditRenderer,
};

interface Props {
  id: string;
  doc: LoroDoc;
  channel: Channel;
  theme: 'light' | 'dark';
  onAgentSection: (section: string | null) => void;
  onOffline: (offline: boolean) => void;
  onEditorReady: (editor: LexicalEditor | null) => void;
  children?: ReactNode;
}

export function DocumentEditor({ id, doc, channel, theme, onAgentSection, onOffline, onEditorReady, children }: Props) {
  const [caret, setCaret] = useState<AgentCaretPosition | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const onAgentCaret = useState(() => (next: AgentCaretPosition | null, section: string | null) => {
    setCaret(next);
    onAgentSection(section);
  })[0];

  return (
    <div ref={setContainer} style={{ position: 'relative' }}>
      <RichEditor variant="article" theme={theme} extraNodes={extraNodes} rendererConfig={rendererConfig} onEditorReady={onEditorReady}>
        <LoroSync id={id} doc={doc} channel={channel} onAgentCaret={onAgentCaret} onOffline={onOffline} />
        <ExcalidrawPlugin />
        <AgentCaret caret={caret} container={container} />
        {children}
      </RichEditor>
    </div>
  );
}
