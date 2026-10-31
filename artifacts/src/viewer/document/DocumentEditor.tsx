import './styles';

import {
  ALERT_NODE_KEY,
  CODE_BLOCK_NODE_KEY,
  IMAGE_NODE_KEY,
  MERMAID_NODE_KEY,
  type RendererConfig,
  RichEditor,
} from '@haklex/rich-editor';
import { EditorSurfacePlugins } from '@haklex/rich-editor/plugins';
import { ChartEditNode } from '@haklex/rich-ext-chart';
import { ExcalidrawEditNode, ExcalidrawPlugin } from '@haklex/rich-ext-excalidraw';
import { stepsEditNodes } from '@haklex/rich-ext-steps/edit';
import { BlockHandlePlugin } from '@haklex/rich-plugin-block-handle';
import { FloatingLinkEditorPlugin } from '@haklex/rich-plugin-link-edit';
import { AlertEditRenderer } from '@haklex/rich-renderer-alert';
import { CodeBlockEditRenderer } from '@haklex/rich-renderer-codeblock';
import { ImageEditRenderer } from '@haklex/rich-renderer-image';
import { katexEditNodes } from '@haklex/rich-renderer-katex';
import { useLexicalEditable } from '@lexical/react/useLexicalEditable';
import type { LexicalEditor } from 'lexical';
import type { LoroDoc } from 'loro-crdt';
import type { ReactNode } from 'react';

import { AgentPlayback, type AgentPlaybackState } from './AgentPlayback';
import { DynamicNode } from './DynamicNode';
import { LoroSync } from './LoroSync';
import { MermaidPreview } from './MermaidPreview';
import { PendingNode } from './PendingNode';
import type { DocumentState, DocumentTransport } from './transport';

export const extraNodes = [
  ChartEditNode,
  ExcalidrawEditNode,
  ...stepsEditNodes,
  DynamicNode,
  PendingNode,
  ...katexEditNodes,
];

export const rendererConfig: RendererConfig = {
  [ALERT_NODE_KEY]: AlertEditRenderer,
  [CODE_BLOCK_NODE_KEY]: CodeBlockEditRenderer,
  [IMAGE_NODE_KEY]: ImageEditRenderer,
  [MERMAID_NODE_KEY]: MermaidPreview,
};

interface Props {
  agent?: string;
  children?: ReactNode;
  doc: LoroDoc;
  onAgentPlayback: (state: AgentPlaybackState) => void;
  onEditorReady: (editor: LexicalEditor | null) => void;
  onOffline: (offline: boolean) => void;
  onState?: (state: DocumentState) => void;
  theme: 'light' | 'dark';
  transport: DocumentTransport;
}

function BlockHandles() {
  const editable = useLexicalEditable();
  return editable ? <BlockHandlePlugin /> : null;
}

export function DocumentEditor({
  transport,
  doc,
  theme,
  onAgentPlayback,
  onOffline,
  onState,
  onEditorReady,
  children,
  agent,
}: Props) {
  return (
    <div style={{ position: 'relative' }}>
      <RichEditor
        extraNodes={extraNodes}
        rendererConfig={rendererConfig}
        theme={theme}
        variant="article"
        onEditorReady={onEditorReady}
      >
        <LoroSync doc={doc} transport={transport} onOffline={onOffline} onState={onState} />
        <ExcalidrawPlugin />
        <FloatingLinkEditorPlugin />
        <EditorSurfacePlugins>
          <BlockHandles />
        </EditorSurfacePlugins>
        <AgentPlayback agent={agent} onPlayback={onAgentPlayback} />
        {children}
      </RichEditor>
    </div>
  );
}
