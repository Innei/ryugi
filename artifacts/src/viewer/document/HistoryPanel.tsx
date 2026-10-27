import { ChevronDown, ChevronRight, ChevronUp, CircleAlert, RotateCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { BottomSheet } from '../components/BottomSheet';
import { t } from '../i18n';
import type { HistoryModel } from './DocumentHistory';
import type { HistoryGroup } from './history';
import { historyClock, historyDay, historyWhen } from './historyTime';

export const SOURCES = {
  human: 'history.sourceHuman',
  agent: 'history.sourceAgent',
  session: 'history.sourceSession',
  unknown: 'history.sourceUnknown',
} as const;

export function selectedGroup(model: HistoryModel) {
  const { session, selected } = model;
  return session && selected
    ? session.history.groups.find((group) => group.entries.includes(selected))
    : undefined;
}

export function latestTime(model: HistoryModel) {
  return model.session?.history.entries.at(-1)?.change.timestamp ?? 0;
}

export function ChangeNav({ model }: { model: HistoryModel }) {
  const { count, changeIndex, loading } = model;
  return (
    <>
      <span aria-live="polite" className="history-count" role="status">
        {count ? changeIndex + 1 : 0} / {count}
      </span>
      <button
        aria-label={t('history.previousChange')}
        className="history-icon"
        disabled={changeIndex === 0 || loading}
        type="button"
        onClick={() => model.navigate(-1)}
      >
        <ChevronUp aria-hidden="true" size={14} />
      </button>
      <button
        aria-label={t('history.nextChange')}
        className="history-icon"
        disabled={changeIndex >= count - 1 || loading}
        type="button"
        onClick={() => model.navigate(1)}
      >
        <ChevronDown aria-hidden="true" size={14} />
      </button>
    </>
  );
}

export function OnlyChanges({ model }: { model: HistoryModel }) {
  return (
    <button
      aria-pressed={model.onlyChanges}
      className="history-filter"
      type="button"
      onClick={model.toggleOnly}
    >
      {t('history.onlyChanges')}
    </button>
  );
}

export function UpdateNotice({ model }: { model: HistoryModel }) {
  if (!model.pending) return null;
  return (
    <div className="history-update" role="status">
      <span>
        {model.streaming
          ? t('history.waitingEdits')
          : t('history.newContent', { time: historyClock(latestTime(model)) })}
      </span>
      <button disabled={model.streaming || model.loading} type="button" onClick={model.refresh}>
        <RotateCw aria-hidden="true" size={12} />
        {t('history.refresh')}
      </button>
    </div>
  );
}

function Compare({ model }: { model: HistoryModel }) {
  const { selected, blocks, count } = model;
  const group = selectedGroup(model);
  const plus = blocks.filter((block) => block.kind === 'insert' || block.kind === 'modify').length;
  const minus = blocks.filter((block) => block.kind === 'delete' || block.kind === 'modify').length;
  return (
    <section aria-label={t('history.range')} className="history-compare">
      <dl>
        <dt>{t('history.from')}</dt>
        <dd>
          <strong>
            {selected ? historyWhen(selected.change.timestamp) : t('history.pickPoint')}
          </strong>
          {group ? <span>{t(SOURCES[group.source])}</span> : null}
        </dd>
        <dt>{t('history.to')}</dt>
        <dd>
          <strong>{t('history.latestVersion')}</strong>
          <span>{historyWhen(latestTime(model))}</span>
        </dd>
      </dl>
      <div className="history-controls">
        <span>{t('history.changes', { count })}</span>
        <span className="history-plus">+{plus}</span>
        <span className="history-minus">−{minus}</span>
        <span className="history-spacer" />
        <OnlyChanges model={model} />
        <ChangeNav model={model} />
      </div>
    </section>
  );
}

function Timeline({ model }: { model: HistoryModel }) {
  const [visible, setVisible] = useState(50);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const { session, selected, blocks } = model;
  if (!session) return null;
  const { groups, entries, shallow } = session.history;
  const current = groups.findIndex(
    (group) => selected !== null && group.entries.includes(selected),
  );
  const changes = new Map<HistoryGroup, number>();
  for (const block of blocks)
    if (block.group) changes.set(block.group, (changes.get(block.group) ?? 0) + 1);
  const shown = groups.slice(0, visible);
  const dayOf = (group: HistoryGroup) => historyDay(group.entries.at(-1)!.change.timestamp);
  const toggle = (id: string) =>
    setExpanded((open) => {
      const next = new Set(open);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <>
      <ol aria-label={t('history.timeline')} className="history-timeline">
        {shown.map((group, index) => {
          const end = group.entries.at(-1)!;
          const day = dayOf(group);
          const newDay = index === 0 || day !== dayOf(shown[index - 1]!);
          const state =
            index === current
              ? 'selected'
              : index === 0
                ? 'latest'
                : index < current
                  ? 'range'
                  : 'outside';
          const open = expanded.has(group.id);
          const changed = index < current ? changes.get(group) : undefined;
          return (
            <li
              className="history-node"
              data-day={newDay ? '' : undefined}
              data-lower={index < current ? 'in' : 'out'}
              data-state={state}
              data-upper={index <= current ? 'in' : 'out'}
              key={group.id}
            >
              {newDay ? <div className="history-day">{day}</div> : null}
              <div className="history-row">
                <span aria-hidden="true" className="history-dot" />
                <button
                  aria-current={state === 'selected' ? 'true' : undefined}
                  className="history-select"
                  type="button"
                  onClick={() => model.select(end)}
                >
                  <span className="history-line">
                    <strong>{historyClock(end.change.timestamp)}</strong>
                    <span>{t(SOURCES[group.source])}</span>
                    {state === 'latest' ? (
                      <span className="history-tag">{t('history.latest')}</span>
                    ) : null}
                    {state === 'selected' ? (
                      <span className="history-tag history-start">{t('history.start')}</span>
                    ) : null}
                  </span>
                  <span className="history-meta">
                    {t('history.commits', { count: group.entries.length })}
                    {changed ? (
                      <span className="history-changed">
                        {t('history.changedSuffix', { count: changed })}
                      </span>
                    ) : null}
                  </span>
                </button>
                <button
                  aria-expanded={open}
                  aria-label={open ? t('history.collapseCommits') : t('history.expandCommits')}
                  className="history-icon history-expand"
                  type="button"
                  onClick={() => toggle(group.id)}
                >
                  <ChevronRight aria-hidden="true" size={14} />
                </button>
              </div>
              {open ? (
                <div className="history-raw">
                  {[...group.entries].reverse().map((entry) => (
                    <button
                      aria-current={entry === selected ? 'true' : undefined}
                      key={entry.id}
                      title={entry.change.message}
                      type="button"
                      onClick={() => model.select(entry)}
                    >
                      <span>{historyClock(entry.change.timestamp, true)}</span>
                      <code>{entry.change.message || t('history.sourceUnknown')}</code>
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {visible < groups.length ? (
        <button
          className="history-more"
          type="button"
          onClick={() => setVisible((value) => value + 50)}
        >
          {t('history.loadEarlier')}
        </button>
      ) : (
        <p className="history-end">
          {shallow ? t('history.shallow') : t('history.earliest')} ·{' '}
          {t('history.summary', {
            edits: t('history.edits', { count: groups.length }),
            commits: t('history.commits', { count: entries.length }),
          })}
          <br />
          {t('history.clockNote')}
        </p>
      )}
    </>
  );
}

function Waiting({ streaming }: { streaming: boolean }) {
  return (
    <div className="history-waiting">
      <p role="status">
        {streaming ? (
          <>
            <strong>{t('history.agentEditing')}</strong>
            <span>{t('history.agentEditingBody')}</span>
          </>
        ) : (
          <strong>{t('history.loading')}</strong>
        )}
      </p>
      <div aria-hidden="true" className="history-skeleton">
        {[150, 130, 160, 120].map((width) => (
          <span key={width} style={{ width }} />
        ))}
      </div>
    </div>
  );
}

function Failure({ model }: { model: HistoryModel }) {
  return (
    <div className="history-failure" role="alert">
      <strong>
        <CircleAlert aria-hidden="true" size={15} />
        {t('history.failed')}
      </strong>
      <code>{model.error}</code>
      <span>{t('history.failedBody')}</span>
      <span className="history-actions">
        <button
          className="history-button"
          disabled={model.streaming}
          type="button"
          onClick={model.refresh}
        >
          {t('common.retry')}
        </button>
        <button className="history-quiet" type="button" onClick={model.close}>
          {t('history.backToComments')}
        </button>
      </span>
    </div>
  );
}

export function HistoryPanel({ model }: { model: HistoryModel }) {
  return (
    <aside aria-label={t('history.title')} className="history-panel">
      <header className="history-panel-head">
        <h2>{t('history.title')}</h2>
        <button
          aria-label={t('history.close')}
          className="history-icon"
          type="button"
          onClick={model.close}
        >
          <X aria-hidden="true" size={14} />
        </button>
      </header>
      <UpdateNotice model={model} />
      {model.error ? (
        <Failure model={model} />
      ) : !model.session ? (
        <Waiting streaming={model.streaming} />
      ) : (
        <>
          <Compare model={model} />
          <Timeline model={model} />
        </>
      )}
    </aside>
  );
}

export function HistorySheet({ model, onDismiss }: { model: HistoryModel; onDismiss: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = root.current;
    const controls = () => [
      ...(panel?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]',
      ) ?? []),
    ];
    controls()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = controls();
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0]?.focus();
      }
    };
    panel?.addEventListener('keydown', trap);
    return () => {
      panel?.removeEventListener('keydown', trap);
      previous?.focus();
    };
  }, []);
  const header = (
    <div className="history-sheet-head">
      <span>
        <strong>{t('history.chooseStart')}</strong>
        <small>{t('history.compareWithLatest', { time: historyWhen(latestTime(model)) })}</small>
      </span>
      <button type="button" onClick={onDismiss}>
        {t('common.done')}
      </button>
    </div>
  );
  return (
    <div
      aria-label={t('history.chooseStart')}
      aria-modal="true"
      className="history-sheet"
      ref={root}
      role="dialog"
    >
      <BottomSheet
        header={header}
        snap={0.85}
        snaps={[0, 0.85]}
        onScrim={onDismiss}
        onSnap={(next) => {
          if (next === 0) onDismiss();
        }}
      >
        <div className="history-sheet-body">
          <Timeline model={model} />
        </div>
      </BottomSheet>
    </div>
  );
}
