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
import { Layers } from './Layers';
import { Properties } from './Properties';
import './inspector.css';
import { t } from '../i18n';

interface Props extends Pick<
  Inspector,
  'frames' | 'selection' | 'targets' | 'select' | 'hoverNode' | 'change' | 'reset'
> {
  boards: [string, BoardSpec][];
  playing: ReadonlySet<string>;
  enabled: boolean;
  onClose: () => void;
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
      <aside className="ryugi-inspector" data-chrome aria-label={t('inspector.label')}>
        <TabsRoot
          value={tab}
          onValueChange={(value) => {
            if (tabs.includes(value as typeof tab)) setTab(value as typeof tab);
          }}
          size="small"
          variant="rounded"
          style={{ display: 'contents' }}
        >
          <header className="ri-header">
            <TabsList
              className="ri-tabs"
              activateOnFocus
              style={{ alignSelf: 'center' }}
              aria-label={t('inspector.views')}
            >
              <TabsIndicator />
              {tabs.map((name) => (
                <TabsTab key={name} value={name}>
                  {t(`inspector.tab.${name}`)}
                  {name === 'Tweaks' && tweaks.length > 0 && (
                    <Circle className="ri-change-dot" size={4} fill="currentColor" aria-hidden />
                  )}
                </TabsTab>
              ))}
            </TabsList>
            <ActionIcon
              icon={X}
              size="small"
              aria-label={t('inspector.close')}
              title={t('inspector.close')}
              onClick={onClose}
            />
          </header>
          <Layers
            boards={boards}
            frames={frames}
            selection={selection}
            targets={targets}
            playing={playing}
            select={select}
            hoverNode={hoverNode}
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
                  icon={Copy}
                  size={{ blockSize: 16, size: 10 }}
                  aria-label={t('inspector.copyNode')}
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
                <Circle size={6} fill="currentColor" aria-hidden />
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
                  key={`${selection!.boardId}:${frames[selection!.boardId]?.session}:${node.id}`}
                  node={node}
                  change={change}
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
                    <Button size="small" type="text" icon={Copy} onClick={() => void copy(css)}>
                      {t('inspector.copy')}
                    </Button>
                  </div>
                  <pre tabIndex={0}>{css}</pre>
                  <div className="ri-code-heading">
                    <h2>HTML</h2>
                    <Button
                      size="small"
                      type="text"
                      icon={Copy}
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
                  icon={RotateCcw}
                  size="small"
                  block
                  disabled={!tweaks.length}
                  onClick={reset}
                >
                  {t('inspector.resetPreview')}
                </Button>
              </section>
            </TabsPanel>
          </div>
          <footer className="ri-footer">
            <Circle className="ri-status-dot" size={5} fill="currentColor" aria-hidden />
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
