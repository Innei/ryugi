import './tweaks.css';

import { Field } from '@base-ui/react/field';
import {
  ActionIcon,
  Button,
  ColorPicker,
  CopyButton,
  IconProvider,
  Input,
  InputNumber,
  ModalBackdrop,
  ModalDescription,
  ModalPopup,
  ModalPortal,
  ModalRoot,
  ModalTitle,
  Segmented,
  Select,
  Slider,
  Switch,
} from '@lobehub/ui';
import { Code2, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import type { TweakControl, TweakValue } from '../../shared/tweaks';
import type { Rect } from '../../shared/types';
import type { BoardTweakState } from '../hooks/useBoardTweaks';
import { t } from '../i18n';
import { isComposing } from '../lib/keyboard';
import type { View } from '../lib/view';

export const TWEAK_PANEL_WIDTH = 352;
export const tweakPanelAnchor = (board: Rect, view: View) => ({
  left: view.x + (board.x + board.w) * view.k + 12,
  top: view.y + board.y * view.k,
});
export function revealTweakPanel(
  board: Rect,
  view: View,
  viewport: { width: number; height: number },
) {
  const anchor = tweakPanelAnchor(board, view);
  return {
    x:
      Math.min(Math.max(12, anchor.left), Math.max(12, viewport.width - TWEAK_PANEL_WIDTH - 12)) -
      anchor.left,
    y: Math.min(Math.max(60, anchor.top), Math.max(60, viewport.height - 604 - 12)) - anchor.top,
  };
}

function NumericInput({
  control,
  value,
  change,
  id,
  width,
}: {
  control: TweakControl;
  value: TweakValue;
  change: (value: TweakValue) => void;
  id: string;
  width?: number;
}) {
  return (
    <Field.Root className="rt-number-field" style={{ width: width ?? '100%', flexShrink: 0 }}>
      <Field.Label className="rt-sr-only">{control.label}</Field.Label>
      <InputNumber
        controls={control.type !== 'range'}
        id={id}
        max={control.max}
        min={control.min}
        size="small"
        step={control.step}
        style={{ width: '100%' }}
        value={value as number}
        onChange={(next) => {
          if (next !== null) change(next);
        }}
      />
    </Field.Root>
  );
}

function Control({
  control,
  value,
  change,
}: {
  control: TweakControl;
  value: TweakValue;
  change: (value: TweakValue) => void;
}) {
  const id = useId();
  const segmented = control.type === 'enum' && control.options!.length <= 3;
  const Field = segmented ? 'fieldset' : 'div';
  let input;
  if (control.type === 'color')
    input = (
      <div className="rt-color">
        {control.options && (
          <div aria-label={control.label} className="rt-swatches" role="group">
            {control.options.map((option) => (
              <button
                aria-label={`${control.label}: ${option.label}`}
                aria-pressed={value === option.value}
                key={option.value}
                style={{ backgroundColor: option.value }}
                type="button"
                onClick={() => change(option.value)}
              />
            ))}
          </div>
        )}
        <ColorPicker
          alpha={false}
          recent={false}
          size="small"
          value={value as string}
          onChange={change}
        >
          <Button aria-label={control.label} id={id} size="small">
            <span className="rt-color-chip" style={{ backgroundColor: value as string }} />
            <code>{String(value)}</code>
          </Button>
        </ColorPicker>
      </div>
    );
  else if (control.type === 'boolean')
    input = (
      <Switch aria-label={control.label} checked={value as boolean} id={id} onChange={change} />
    );
  else if (control.type === 'range')
    input = (
      <div className="rt-range">
        <Slider
          aria-labelledby={`${id}-label`}
          max={control.max}
          min={control.min}
          step={control.step}
          value={value as number}
          onChange={change}
        />
        <NumericInput
          change={change}
          control={control}
          id={`${id}-number`}
          value={value}
          width={48}
        />
      </div>
    );
  else if (control.type === 'number')
    input = <NumericInput change={change} control={control} id={id} value={value} />;
  else if (control.type === 'enum')
    input = segmented ? (
      <Segmented
        block
        options={control.options}
        size="small"
        value={value as string}
        onChange={change}
      />
    ) : (
      <Select
        id={id}
        options={control.options}
        size="small"
        style={{ width: '100%' }}
        value={value as string}
        onChange={(next) => {
          if (typeof next === 'string') change(next);
        }}
      />
    );
  else
    input = (
      <Input
        aria-label={control.label}
        id={id}
        maxLength={512}
        size="small"
        value={value as string}
        onChange={(event) => change(event.target.value)}
      />
    );
  return (
    <Field className="rt-field" data-changed={value !== control.default || undefined}>
      {segmented ? (
        <legend>{control.label}</legend>
      ) : control.type === 'range' ? (
        <span id={`${id}-label`}>{control.label}</span>
      ) : (
        <label htmlFor={id}>{control.label}</label>
      )}
      <div className="rt-control">
        <div className="rt-input">{input}</div>
        <ActionIcon
          aria-label={t('parameters.resetControl', { label: control.label })}
          className="rt-field-reset"
          disabled={value === control.default}
          icon={RotateCcw}
          size={{ blockSize: 22, size: 11 }}
          title={t('parameters.resetControl', { label: control.label })}
          onClick={() => change(control.default)}
        />
      </div>
    </Field>
  );
}

interface Props {
  anchor?: { left: number; top: number };
  boardId: string;
  onChange: (key: string, value: TweakValue) => void;
  onClose: () => void;
  onReset: () => void;
  state: BoardTweakState;
  title: string;
}

export function TweaksPanel({ boardId, title, state, anchor, onChange, onReset, onClose }: Props) {
  const declarationTriggerRef = useRef<HTMLButtonElement>(null);
  const declarationId = useId();
  const [declarationOpen, setDeclarationOpen] = useState(false);
  const [declarationTab, setDeclarationTab] = useState<'schema' | 'values'>('schema');
  const declarationLabel =
    declarationTab === 'schema' ? t('parameters.schema') : t('parameters.currentValues');
  const declaration = JSON.stringify(
    declarationTab === 'schema' ? state.schema : state.values,
    null,
    2,
  );
  const groups = new Map<string, [string, TweakControl][]>();
  for (const entry of Object.entries(state.schema?.controls ?? {})) {
    const name = entry[1].section || t('parameters.controls');
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(entry);
  }
  const changed = Object.entries(state.values).filter(
    ([key, value]) => value !== state.schema?.controls[key]?.default,
  ).length;
  return (
    <IconProvider config={{ 'aria-hidden': true }}>
      <aside
        aria-label={t('parameters.title')}
        className="ryugi-parameters"
        data-chrome="parameters"
        style={{
          position: anchor ? 'absolute' : 'relative',
          ...anchor,
          width: TWEAK_PANEL_WIDTH,
          maxHeight: anchor
            ? `min(604px, calc(100% - ${Math.max(0, anchor.top)}px - 12px))`
            : 'min(604px, calc(100vh - 112px))',
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape' && !event.defaultPrevented && !isComposing(event.nativeEvent))
            onClose();
        }}
      >
        <header className="rt-header">
          <SlidersHorizontal aria-hidden size={15} />
          <h2>{t('parameters.title')}</h2>
          <span className="rt-count">{Object.keys(state.schema?.controls ?? {}).length}</span>
          <ActionIcon
            aria-label={t('parameters.close')}
            icon={X}
            size="small"
            title={t('parameters.close')}
            onClick={onClose}
          />
        </header>
        <div className="rt-board">
          <strong title={title}>{title}</strong>
          <code title={boardId}>{boardId}</code>
          <span>{t('parameters.currentBoard')}</span>
        </div>
        <div className="rt-body">
          {state.error && (
            <p className="rt-error" role="alert">
              {state.error}
            </p>
          )}
          {[...groups].map(([name, controls]) => (
            <section className="rt-section" key={name}>
              <h3>{name}</h3>
              {controls.map(([key, control]) => (
                <Control
                  change={(value) => onChange(key, value)}
                  control={control}
                  key={key}
                  value={state.values[key]!}
                />
              ))}
            </section>
          ))}
        </div>
        <footer className="rt-footer">
          <span className={changed ? 'rt-changed' : undefined} role="status">
            {changed ? t('parameters.changed', { count: changed }) : t('parameters.defaults')}
          </span>
          <Button disabled={!changed} icon={RotateCcw} size="small" type="text" onClick={onReset}>
            {t('parameters.reset')}
          </Button>
          {state.schema && (
            <Button
              aria-haspopup="dialog"
              icon={Code2}
              ref={declarationTriggerRef}
              size="small"
              type="text"
              onClick={() => {
                setDeclarationTab('schema');
                setDeclarationOpen(true);
              }}
            >
              {t('parameters.viewDeclaration')}
            </Button>
          )}
        </footer>
      </aside>
      <ModalRoot
        open={declarationOpen}
        onExitComplete={() => declarationTriggerRef.current?.focus()}
        onOpenChange={setDeclarationOpen}
      >
        <ModalPortal>
          <ModalBackdrop />
          <ModalPopup
            aria-labelledby={`${declarationId}-title`}
            style={{ height: 'min(580px, calc(100dvh - 96px))', overflow: 'hidden' }}
            width="min(650px, calc(100vw - 32px))"
          >
            <div
              className="rt-dialog"
              data-chrome="parameter-declaration"
              onKeyDown={(event) => {
                event.stopPropagation();
                if (
                  event.key === 'Escape' &&
                  !event.defaultPrevented &&
                  !isComposing(event.nativeEvent)
                )
                  setDeclarationOpen(false);
              }}
            >
              <header>
                <Code2 aria-hidden size={17} />
                <ModalTitle id={`${declarationId}-title`}>{t('parameters.declaration')}</ModalTitle>
                <code>{boardId}</code>
                <ActionIcon
                  aria-label={t('parameters.closeDeclaration')}
                  icon={X}
                  size="small"
                  onClick={() => setDeclarationOpen(false)}
                />
              </header>
              <div className="rt-code-toolbar">
                <div
                  aria-label={t('parameters.declaration')}
                  className="rt-code-tabs"
                  role="tablist"
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const next =
                      event.key === 'Home'
                        ? 'schema'
                        : event.key === 'End'
                          ? 'values'
                          : declarationTab === 'schema'
                            ? 'values'
                            : 'schema';
                    setDeclarationTab(next);
                    event.currentTarget
                      .querySelector<HTMLButtonElement>(`[data-json-tab="${next}"]`)
                      ?.focus();
                  }}
                >
                  {(['schema', 'values'] as const).map((tab) => (
                    <button
                      aria-controls={`${declarationId}-code`}
                      aria-selected={declarationTab === tab}
                      data-json-tab={tab}
                      id={`${declarationId}-${tab}`}
                      key={tab}
                      role="tab"
                      tabIndex={declarationTab === tab ? 0 : -1}
                      type="button"
                      onClick={() => setDeclarationTab(tab)}
                    >
                      {tab === 'schema' ? t('parameters.schema') : t('parameters.currentValues')}
                    </button>
                  ))}
                </div>
                <CopyButton
                  aria-label={t('parameters.copy')}
                  content={declaration}
                  size="small"
                  title={t('parameters.copy')}
                />
              </div>
              <div className="rt-code-content">
                <pre
                  aria-label={declarationLabel}
                  aria-labelledby={`${declarationId}-${declarationTab}`}
                  id={`${declarationId}-code`}
                  role="tabpanel"
                  tabIndex={0}
                >
                  {declaration}
                </pre>
              </div>
              <ModalDescription>{t('parameters.sessionOnly')}</ModalDescription>
            </div>
          </ModalPopup>
        </ModalPortal>
      </ModalRoot>
    </IconProvider>
  );
}
