import '../panels.css';

import {
  ActionIcon,
  Button,
  IconProvider,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsRoot,
  TabsTab,
} from '@lobehub/ui';
import * as stylex from '@stylexjs/stylex';
import { Circle, Copy, RotateCcw, X } from 'lucide-react';
import { memo, useState } from 'react';

import type { BoardSpec } from '../../shared/types';
import type { Inspector } from '../hooks/useInspector';
import { t } from '../i18n';
import { Layers } from './Layers';
import { Properties } from './Properties';
import { styles } from './styles';

interface Props extends Pick<
  Inspector,
  'frames' | 'selection' | 'targets' | 'select' | 'hoverNode' | 'change' | 'reset'
> {
  boards: [string, BoardSpec][];
  enabled: boolean;
  onClose: () => void;
  playing: ReadonlySet<string>;
}
const tabs = ['Properties', 'Code', 'Tweaks'] as const;

export const InspectorPanel = memo(function InspectorPanel({
  boards,
  frames,
  selection,
  targets,
  playing,
  select,
  hoverNode,
  change,
  reset,
  enabled,
  onClose,
}: Props) {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Properties');
  const [copyStatus, setCopyStatus] = useState('');
  const node = selection?.node;
  const tweaks = Object.entries(frames).flatMap(([boardId, frame]) =>
    frame.tweaks.map((tweak) => ({ ...tweak, boardId })),
  );
  const css = node
    ? `${node.selector} {\n${Object.entries(node.css)
        .map(([key, value]) => `  ${key}: ${value};`)
        .join('\n')}\n}`
    : '';
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(t('inspector.copied'));
    } catch {
      setCopyStatus(t('inspector.copyFailed'));
    }
  };
  const panelClass = [stylex.props(styles.panel).className, 'ryugi-inspector']
    .filter(Boolean)
    .join(' ');
  return (
    <IconProvider config={{ 'aria-hidden': true }}>
      <aside data-chrome aria-label={t('inspector.label')} className={panelClass}>
        <TabsRoot
          size="small"
          style={{ display: 'contents' }}
          value={tab}
          variant="rounded"
          onValueChange={(value) => {
            if (tabs.includes(value as typeof tab)) setTab(value as typeof tab);
          }}
        >
          <header {...stylex.props(styles.header)}>
            <TabsList
              activateOnFocus
              aria-label={t('inspector.views')}
              className={stylex.props(styles.tabs).className}
              style={{ alignSelf: 'center' }}
            >
              <TabsIndicator />
              {tabs.map((name) => (
                <TabsTab key={name} style={{ position: 'relative' }} value={name}>
                  {t(`inspector.tab.${name}`)}
                  {name === 'Tweaks' && tweaks.length > 0 && (
                    <Circle
                      aria-hidden
                      fill="currentColor"
                      size={4}
                      {...stylex.props(styles.changeDot)}
                    />
                  )}
                </TabsTab>
              ))}
            </TabsList>
            <ActionIcon
              aria-label={t('inspector.close')}
              icon={X}
              size="small"
              title={t('inspector.close')}
              onClick={onClose}
            />
          </header>
          <Layers
            boards={boards}
            frames={frames}
            hoverNode={hoverNode}
            playing={playing}
            select={select}
            selection={selection}
            targets={targets}
          />
          <div data-node-meta="" {...stylex.props(styles.nodeMeta)}>
            <code>
              {targets.length > 1
                ? t('inspector.selected', { count: targets.length })
                : node
                  ? `<${node.tag}>`
                  : t('inspector.selectElement')}
            </code>
            {node && (
              <span data-node-id="" {...stylex.props(styles.nodeId)}>
                {`${selection!.boardId}#${node.id}`}
                <ActionIcon
                  aria-label={t('inspector.copyNode')}
                  icon={Copy}
                  size={{ blockSize: 16, size: 10 }}
                  title={t('inspector.copyNode')}
                  onClick={() => void copy(`${selection!.boardId}#${node.id}`)}
                />
              </span>
            )}
            <span title={node?.selector} {...stylex.props(styles.nodeSelector)}>
              {node?.selector}
            </span>
            {node && (
              <span {...stylex.props(styles.live)}>
                <Circle aria-hidden fill="currentColor" size={6} />
                {t('inspector.live')}
              </span>
            )}
          </div>
          {targets.length > 1 && (
            <p {...stylex.props(styles.hint)} style={{ margin: '8px 16px' }}>
              {t('inspector.lastSelected')}
            </p>
          )}
          <div {...stylex.props(styles.panelBody)}>
            <TabsPanel value="Properties" {...stylex.props(styles.panelBodyPanel)}>
              {node && enabled ? (
                <Properties
                  change={change}
                  key={`${selection!.boardId}:${frames[selection!.boardId]?.session}:${node.id}`}
                  node={node}
                />
              ) : (
                <p {...stylex.props(styles.empty)}>
                  {!enabled ? t('inspector.closeExpanded') : t('inspector.pickElement')}
                </p>
              )}
            </TabsPanel>
            <TabsPanel value="Code" {...stylex.props(styles.panelBodyPanel)}>
              {node ? (
                <div {...stylex.props(styles.code)}>
                  <div {...stylex.props(styles.codeHeading)}>
                    <h2 {...stylex.props(styles.codeTitle)}>{t('inspector.computedCss')}</h2>
                    <Button icon={Copy} size="small" type="text" onClick={() => void copy(css)}>
                      {t('inspector.copy')}
                    </Button>
                  </div>
                  <pre tabIndex={0} {...stylex.props(styles.codePre)}>
                    {css}
                  </pre>
                  <div {...stylex.props(styles.codeHeading)}>
                    <h2 {...stylex.props(styles.codeTitle)}>HTML</h2>
                    <Button
                      icon={Copy}
                      size="small"
                      type="text"
                      onClick={() => void copy(node.html)}
                    >
                      {t('inspector.copy')}
                    </Button>
                  </div>
                  <pre tabIndex={0} {...stylex.props(styles.codePre)}>
                    {node.html}
                  </pre>
                  <p role="status" {...stylex.props(styles.hint)}>
                    {copyStatus || t('inspector.fromDom')}
                  </p>
                </div>
              ) : (
                <p {...stylex.props(styles.empty)}>{t('inspector.selectForCode')}</p>
              )}
            </TabsPanel>
            <TabsPanel value="Tweaks" {...stylex.props(styles.panelBodyPanel)}>
              <section {...stylex.props(styles.section)}>
                <h2 {...stylex.props(styles.sectionTitle)}>
                  {t('inspector.sessionChanges')}{' '}
                  <span {...stylex.props(styles.count)}>{tweaks.length}</span>
                </h2>
                <p {...stylex.props(styles.hint)}>{t('inspector.changesApply')}</p>
                <div {...stylex.props(styles.tweaks)}>
                  {tweaks.map((tweak) => (
                    <div
                      key={`${tweak.boardId}:${tweak.id}:${tweak.property}`}
                      {...stylex.props(styles.tweak)}
                    >
                      <span {...stylex.props(styles.tweakLabel)}>
                        {boards.find(([id]) => id === tweak.boardId)?.[1].title || tweak.boardId} ·{' '}
                        {tweak.name}
                      </span>
                      <code {...stylex.props(styles.tweakCode)}>
                        {tweak.property}: {tweak.value}
                      </code>
                    </div>
                  ))}
                </div>
                {!tweaks.length && <p {...stylex.props(styles.hint)}>{t('inspector.noChanges')}</p>}
                <Button
                  block
                  disabled={!tweaks.length}
                  icon={RotateCcw}
                  size="small"
                  onClick={reset}
                >
                  {t('inspector.resetPreview')}
                </Button>
              </section>
            </TabsPanel>
          </div>
          <footer {...stylex.props(styles.footer)}>
            <Circle aria-hidden fill="currentColor" size={5} {...stylex.props(styles.statusDot)} />
            {tweaks.length
              ? t('inspector.previewChanges', { count: tweaks.length })
              : t('inspector.liveInspection')}
            <span {...stylex.props(styles.footerNote)}>{t('inspector.previewOnly')}</span>
          </footer>
        </TabsRoot>
      </aside>
    </IconProvider>
  );
});
