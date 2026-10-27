import './inspector.css';

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
import { Circle, Copy, RotateCcw, X } from 'lucide-react';
import { memo, useState } from 'react';

import type { BoardSpec } from '../../shared/types';
import type { Inspector } from '../hooks/useInspector';
import { t } from '../i18n';
import { Layers } from './Layers';
import { Properties } from './Properties';

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
  return (
    <IconProvider config={{ 'aria-hidden': true }}>
      <aside data-chrome aria-label={t('inspector.label')} className="ryugi-inspector">
        <TabsRoot
          size="small"
          style={{ display: 'contents' }}
          value={tab}
          variant="rounded"
          onValueChange={(value) => {
            if (tabs.includes(value as typeof tab)) setTab(value as typeof tab);
          }}
        >
          <header className="ri-header">
            <TabsList
              activateOnFocus
              aria-label={t('inspector.views')}
              className="ri-tabs"
              style={{ alignSelf: 'center' }}
            >
              <TabsIndicator />
              {tabs.map((name) => (
                <TabsTab key={name} value={name}>
                  {t(`inspector.tab.${name}`)}
                  {name === 'Tweaks' && tweaks.length > 0 && (
                    <Circle aria-hidden className="ri-change-dot" fill="currentColor" size={4} />
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
          <div className="ri-node-meta">
            <code>
              {targets.length > 1
                ? t('inspector.selected', { count: targets.length })
                : node
                  ? `<${node.tag}>`
                  : t('inspector.selectElement')}
            </code>
            {node && (
              <span className="ri-node-id">
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
            <span className="ri-node-selector" title={node?.selector}>
              {node?.selector}
            </span>
            {node && (
              <span className="ri-live">
                <Circle aria-hidden fill="currentColor" size={6} />
                {t('inspector.live')}
              </span>
            )}
          </div>
          {targets.length > 1 && (
            <p className="ri-hint" style={{ margin: '8px 16px' }}>
              {t('inspector.lastSelected')}
            </p>
          )}
          <div className="ri-panel-body">
            <TabsPanel value="Properties">
              {node && enabled ? (
                <Properties
                  change={change}
                  key={`${selection!.boardId}:${frames[selection!.boardId]?.session}:${node.id}`}
                  node={node}
                />
              ) : (
                <p className="ri-empty">
                  {!enabled ? t('inspector.closeExpanded') : t('inspector.pickElement')}
                </p>
              )}
            </TabsPanel>
            <TabsPanel value="Code">
              {node ? (
                <div className="ri-code">
                  <div className="ri-code-heading">
                    <h2>{t('inspector.computedCss')}</h2>
                    <Button icon={Copy} size="small" type="text" onClick={() => void copy(css)}>
                      {t('inspector.copy')}
                    </Button>
                  </div>
                  <pre tabIndex={0}>{css}</pre>
                  <div className="ri-code-heading">
                    <h2>HTML</h2>
                    <Button
                      icon={Copy}
                      size="small"
                      type="text"
                      onClick={() => void copy(node.html)}
                    >
                      {t('inspector.copy')}
                    </Button>
                  </div>
                  <pre tabIndex={0}>{node.html}</pre>
                  <p className="ri-hint" role="status">
                    {copyStatus || t('inspector.fromDom')}
                  </p>
                </div>
              ) : (
                <p className="ri-empty">{t('inspector.selectForCode')}</p>
              )}
            </TabsPanel>
            <TabsPanel value="Tweaks">
              <section className="ri-section">
                <h2>
                  {t('inspector.sessionChanges')} <span className="ri-count">{tweaks.length}</span>
                </h2>
                <p className="ri-hint">{t('inspector.changesApply')}</p>
                <div className="ri-tweaks">
                  {tweaks.map((tweak) => (
                    <div
                      className="ri-tweak"
                      key={`${tweak.boardId}:${tweak.id}:${tweak.property}`}
                    >
                      <span>
                        {boards.find(([id]) => id === tweak.boardId)?.[1].title || tweak.boardId} ·{' '}
                        {tweak.name}
                      </span>
                      <code>
                        {tweak.property}: {tweak.value}
                      </code>
                    </div>
                  ))}
                </div>
                {!tweaks.length && <p className="ri-hint">{t('inspector.noChanges')}</p>}
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
          <footer className="ri-footer">
            <Circle aria-hidden className="ri-status-dot" fill="currentColor" size={5} />
            {tweaks.length
              ? t('inspector.previewChanges', { count: tweaks.length })
              : t('inspector.liveInspection')}
            <span>{t('inspector.previewOnly')}</span>
          </footer>
        </TabsRoot>
      </aside>
    </IconProvider>
  );
});
