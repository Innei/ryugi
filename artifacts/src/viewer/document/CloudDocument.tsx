import './styles';
import { RichEditor } from '@haklex/rich-editor';
import { ExcalidrawPlugin } from '@haklex/rich-ext-excalidraw';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import type { SerializedEditorState } from 'lexical';
import { useEffect, useMemo, useState } from 'react';
import { createChannel } from './channel';
import { extraNodes, rendererConfig } from './DocumentEditor';
import { DynamicHostContext, type DynamicHost } from './DynamicBlock';

const styles = stylex.create({
  root: { minHeight: '100%', backgroundColor: cssVar.colorBgContainer, color: cssVar.colorText },
  column: { maxWidth: 700, marginInline: 'auto', paddingBlock: 40, paddingInline: 24 },
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
}

export default function CloudDocument({ id, state, contentBase }: Props) {
  const dark = usePrefersDark();
  const host = useMemo<DynamicHost>(() => ({ artifact: `cloud/${id}`, contentBase, channel: createChannel(), send: () => undefined }), [id, contentBase]);

  useEffect(() => {
    const base = document.createElement('base');
    base.href = contentBase;
    document.head.prepend(base);
    return () => base.remove();
  }, [contentBase]);

  return (
    <div {...stylex.props(styles.root)} className={`ryugi-doc ${stylex.props(styles.root).className ?? ''}`}>
      <article {...stylex.props(styles.column)}>
        <DynamicHostContext.Provider value={host}>
          <RichEditor
            variant="article"
            theme={dark ? 'dark' : 'light'}
            initialValue={state}
            extraNodes={extraNodes}
            rendererConfig={rendererConfig}
            onEditorReady={(editor) => editor?.setEditable(false)}
          >
            <ExcalidrawPlugin />
          </RichEditor>
        </DynamicHostContext.Provider>
      </article>
    </div>
  );
}
