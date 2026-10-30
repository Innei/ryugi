import * as stylex from '@stylexjs/stylex';
import { ChevronDown, ChevronRight, ChevronUp, CircleAlert, RotateCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { BottomSheet } from '../components/BottomSheet';
import { t } from '../i18n';
import type { HistoryModel } from './DocumentHistory';
import type { HistoryGroup } from './history';
import { styles } from './historyStyles';
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

export function ChangeNav({ model, strip }: { model: HistoryModel; strip?: boolean }) {
  const { count, changeIndex, loading } = model;
  return (
    <>
      <span aria-live="polite" role="status" {...stylex.props(styles.count)}>
        {count ? changeIndex + 1 : 0} / {count}
      </span>
      <button
        aria-label={t('history.previousChange')}
        disabled={changeIndex === 0 || loading}
        type="button"
        {...stylex.props(styles.buttonBase, styles.icon, strip && styles.stripIcon)}
        onClick={() => model.navigate(-1)}
      >
        <ChevronUp aria-hidden="true" size={14} />
      </button>
      <button
        aria-label={t('history.nextChange')}
        disabled={changeIndex >= count - 1 || loading}
        type="button"
        {...stylex.props(styles.buttonBase, styles.icon, strip && styles.stripIcon)}
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
      type="button"
      {...stylex.props(styles.buttonBase, styles.filter, model.onlyChanges && styles.filterOn)}
      onClick={model.toggleOnly}
    >
      {t('history.onlyChanges')}
    </button>
  );
}

export function UpdateNotice({ compact, model }: { compact?: boolean; model: HistoryModel }) {
  if (!model.pending) return null;
  return (
    <div role="status" {...stylex.props(compact ? styles.updateCompact : styles.update)}>
      <span {...stylex.props(styles.updateText)}>
        {model.streaming
          ? t('history.waitingEdits')
          : t('history.newContent', { time: historyClock(latestTime(model)) })}
      </span>
      <button
        disabled={model.streaming || model.loading}
        type="button"
        {...stylex.props(styles.buttonBase, styles.updateButton)}
        onClick={model.refresh}
      >
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
    <section aria-label={t('history.range')} {...stylex.props(styles.compare)}>
      <dl {...stylex.props(styles.compareList)}>
        <dt {...stylex.props(styles.compareTerm)}>{t('history.from')}</dt>
        <dd {...stylex.props(styles.compareValue)}>
          <strong {...stylex.props(styles.compareStrong)}>
            {selected ? historyWhen(selected.change.timestamp) : t('history.pickPoint')}
          </strong>
          {group ? (
            <span {...stylex.props(styles.compareSpan)}>{t(SOURCES[group.source])}</span>
          ) : null}
        </dd>
        <dt {...stylex.props(styles.compareTerm)}>{t('history.to')}</dt>
        <dd {...stylex.props(styles.compareValue)}>
          <strong {...stylex.props(styles.compareStrong)}>{t('history.latestVersion')}</strong>
          <span {...stylex.props(styles.compareSpan)}>{historyWhen(latestTime(model))}</span>
        </dd>
      </dl>
      <div {...stylex.props(styles.controls)}>
        <span>{t('history.changes', { count })}</span>
        <span {...stylex.props(styles.plus)}>+{plus}</span>
        <span {...stylex.props(styles.minus)}>−{minus}</span>
        <span {...stylex.props(styles.spacer)} />
        <OnlyChanges model={model} />
        <ChangeNav model={model} />
      </div>
    </section>
  );
}

function Timeline({ model, sheet }: { model: HistoryModel; sheet?: boolean }) {
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
      <ol aria-label={t('history.timeline')} {...stylex.props(styles.timeline)}>
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
              data-day={newDay ? '' : undefined}
              data-lower={index < current ? 'in' : 'out'}
              data-state={state}
              data-upper={index <= current ? 'in' : 'out'}
              key={group.id}
              {...stylex.props(styles.node)}
            >
              {newDay ? <div {...stylex.props(styles.day)}>{day}</div> : null}
              <div {...stylex.props(styles.row)}>
                <span aria-hidden="true" data-state={state} {...stylex.props(styles.dot)} />
                <button
                  aria-current={state === 'selected' ? 'true' : undefined}
                  data-state={state}
                  type="button"
                  {...stylex.props(styles.buttonBase, styles.select, sheet && styles.sheetSelect)}
                  onClick={() => model.select(end)}
                >
                  <span {...stylex.props(styles.line)}>
                    <strong {...stylex.props(styles.lineStrong)}>
                      {historyClock(end.change.timestamp)}
                    </strong>
                    <span {...stylex.props(styles.lineText)}>{t(SOURCES[group.source])}</span>
                    {state === 'latest' ? (
                      <span {...stylex.props(styles.tag)}>{t('history.latest')}</span>
                    ) : null}
                    {state === 'selected' ? (
                      <span {...stylex.props(styles.tag, styles.tagStart)}>
                        {t('history.start')}
                      </span>
                    ) : null}
                  </span>
                  <span {...stylex.props(styles.meta)}>
                    {t('history.commits', { count: group.entries.length })}
                    {changed ? (
                      <span {...stylex.props(styles.changed)}>
                        {t('history.changedSuffix', { count: changed })}
                      </span>
                    ) : null}
                  </span>
                </button>
                <button
                  aria-expanded={open}
                  aria-label={open ? t('history.collapseCommits') : t('history.expandCommits')}
                  type="button"
                  {...stylex.props(styles.buttonBase, styles.icon, styles.expand)}
                  onClick={() => toggle(group.id)}
                >
                  <ChevronRight
                    aria-hidden="true"
                    size={14}
                    {...stylex.props(styles.expandIcon, open && styles.expandIconOpen)}
                  />
                </button>
              </div>
              {open ? (
                <div {...stylex.props(styles.raw)}>
                  {[...group.entries].reverse().map((entry) => (
                    <button
                      aria-current={entry === selected ? 'true' : undefined}
                      key={entry.id}
                      title={entry.change.message}
                      type="button"
                      {...stylex.props(styles.buttonBase, styles.rawButton)}
                      onClick={() => model.select(entry)}
                    >
                      <span {...stylex.props(styles.rawTime)}>
                        {historyClock(entry.change.timestamp, true)}
                      </span>
                      <code {...stylex.props(styles.rawCode)}>
                        {entry.change.message || t('history.sourceUnknown')}
                      </code>
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
          type="button"
          {...stylex.props(styles.buttonBase, styles.more)}
          onClick={() => setVisible((value) => value + 50)}
        >
          {t('history.loadEarlier')}
        </button>
      ) : (
        <p {...stylex.props(styles.end)}>
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
    <div>
      <p role="status" {...stylex.props(styles.waitingP)}>
        {streaming ? (
          <>
            <strong {...stylex.props(styles.waitingStrong)}>{t('history.agentEditing')}</strong>
            <span {...stylex.props(styles.waitingSpan)}>{t('history.agentEditingBody')}</span>
          </>
        ) : (
          <strong {...stylex.props(styles.waitingStrong)}>{t('history.loading')}</strong>
        )}
      </p>
      <div aria-hidden="true" {...stylex.props(styles.skeleton)}>
        {[150, 130, 160, 120].map((width) => (
          <span key={width} style={{ width }} {...stylex.props(styles.skeletonBar)} />
        ))}
      </div>
    </div>
  );
}

function Failure({ model }: { model: HistoryModel }) {
  return (
    <div role="alert" {...stylex.props(styles.failure)}>
      <strong {...stylex.props(styles.failureStrong)}>
        <CircleAlert aria-hidden="true" size={15} />
        {t('history.failed')}
      </strong>
      <code {...stylex.props(styles.failureCode)}>{model.error}</code>
      <span {...stylex.props(styles.failureText)}>{t('history.failedBody')}</span>
      <span {...stylex.props(styles.actions)}>
        <button
          disabled={model.streaming}
          type="button"
          {...stylex.props(styles.buttonBase, styles.button)}
          onClick={model.refresh}
        >
          {t('common.retry')}
        </button>
        <button
          type="button"
          {...stylex.props(styles.buttonBase, styles.quiet)}
          onClick={model.close}
        >
          {t('history.backToComments')}
        </button>
      </span>
    </div>
  );
}

export function HistoryPanel({ model }: { model: HistoryModel }) {
  const panelClass = [stylex.props(styles.text, styles.panel).className, 'history-panel']
    .filter(Boolean)
    .join(' ');
  return (
    <aside aria-label={t('history.title')} className={panelClass}>
      <header {...stylex.props(styles.panelHead)}>
        <h2 {...stylex.props(styles.panelTitle)}>{t('history.title')}</h2>
        <button
          aria-label={t('history.close')}
          type="button"
          {...stylex.props(styles.buttonBase, styles.icon)}
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
    <div {...stylex.props(styles.sheetHead)}>
      <span {...stylex.props(styles.sheetHeadText)}>
        <strong {...stylex.props(styles.sheetTitle)}>{t('history.chooseStart')}</strong>
        <small {...stylex.props(styles.sheetSmall)}>
          {t('history.compareWithLatest', { time: historyWhen(latestTime(model)) })}
        </small>
      </span>
      <button
        type="button"
        {...stylex.props(styles.buttonBase, styles.sheetButton)}
        onClick={onDismiss}
      >
        {t('common.done')}
      </button>
    </div>
  );
  return (
    <div
      aria-label={t('history.chooseStart')}
      aria-modal="true"
      ref={root}
      role="dialog"
      {...stylex.props(styles.text, styles.sheet)}
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
        <div {...stylex.props(styles.sheetBody)}>
          <Timeline sheet model={model} />
        </div>
      </BottomSheet>
    </div>
  );
}
