import './styles';
import { RichEditor } from '@haklex/rich-editor';
import { ExcalidrawPlugin } from '@haklex/rich-ext-excalidraw';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import type { LexicalEditor, SerializedEditorState } from 'lexical';
import { useEffect, useMemo, useState } from 'react';
import { emptyComments, type CommentsFile } from '../../shared/comments';
import { createChannel } from './channel';
import { extraNodes, rendererConfig } from './DocumentEditor';
import { DocumentLayout } from './DocumentLayout';
import { DynamicHostContext, type DynamicHost } from './DynamicBlock';

const styles = stylex.create({
  root: { minHeight: '100%', backgroundColor: cssVar.colorBgContainer, color: cssVar.colorText },
});

function usePrefersDark() {
  const query = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [dark, setDark] = useState(query.matches);
  useEffect(() => {
    const onChange = () => setDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [query]);
  return dark;
}

interface Props {
  id: string;
  state: SerializedEditorState;
  contentBase: string;
  comments?: CommentsFile;
}

export default function CloudDocument({ id, state, contentBase, comments = emptyComments() }: Props) {
  const dark = usePrefersDark();
  const [editor, setEditor] = useState<LexicalEditor | null>(null);
  const host = useMemo<DynamicHost>(() => ({ artifact: `cloud/${id}`, contentBase, channel: createChannel(), send: () => undefined }), [id, contentBase]);

  useEffect(() => {
    const base = document.createElement('base');
    base.href = contentBase;
    document.head.prepend(base);
    return () => base.remove();
  }, [contentBase]);

  return (
    <div {...stylex.props(styles.root)} className={`ryugi-doc ${stylex.props(styles.root).className ?? ''}`}>
      <DocumentLayout editor={editor} threads={comments.threads}>
        <DynamicHostContext.Provider value={host}>
          <RichEditor
            variant="article"
            theme={dark ? 'dark' : 'light'}
            initialValue={state}
            extraNodes={extraNodes}
            rendererConfig={rendererConfig}
            onEditorReady={(ready) => {
              ready?.setEditable(false);
              setEditor(ready ?? null);
            }}
          >
            <ExcalidrawPlugin />
          </RichEditor>
        </DynamicHostContext.Provider>
      </DocumentLayout>
    </div>
  );
}
