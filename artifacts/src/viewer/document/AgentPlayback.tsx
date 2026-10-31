import { AgentStreamPlugin, type PlaybackState } from '@haklex/rich-plugin-agent-stream';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, $getRoot, $isElementNode, type LexicalEditor, type NodeKey } from 'lexical';
import { useCallback } from 'react';

import { sectionLabel } from '../lib/section';

export interface AgentPlaybackState {
  playing: boolean;
  section: string | null;
}

function sectionOf(editor: LexicalEditor, key: NodeKey) {
  return editor.getEditorState().read(() => {
    const top = $getNodeByKey(key)?.getTopLevelElement();
    const blocks = $getRoot()
      .getChildren()
      .map((block) => ({
        heading: block.getType() === 'heading',
        text: $isElementNode(block) ? block.getTextContent() : '',
      }));
    return top ? sectionLabel(blocks, top.getIndexWithinParent()) : null;
  });
}

export function AgentPlayback({
  agent = 'Agent',
  onPlayback,
}: {
  agent?: string;
  onPlayback: (state: AgentPlaybackState) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const onPlaybackChange = useCallback(
    ({ playing, blockKey }: PlaybackState) =>
      onPlayback({ playing, section: playing && blockKey ? sectionOf(editor, blockKey) : null }),
    [editor, onPlayback],
  );
  return <AgentStreamPlugin agentName={agent} onPlaybackChange={onPlaybackChange} />;
}
