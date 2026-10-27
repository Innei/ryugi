import './tweaks.css';

import {
  ActionIcon,
  Button,
  ColorPicker,
  IconProvider,
  Input,
  InputNumber,
  Segmented,
  Select,
  Slider,
  Switch,
} from '@lobehub/ui';
import { Code2, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useId, useRef } from 'react';

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
        <output>{String(value)}</output>
      </div>
    );
  else if (control.type === 'number')
    input = (
      <InputNumber
        aria-label={control.label}
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
    );
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
    <Field className="rt-field">
      {segmented ? (
        <legend>{control.label}</legend>
      ) : control.type === 'range' ? (
        <span id={`${id}-label`}>{control.label}</span>
      ) : (
        <label htmlFor={id}>{control.label}</label>
      )}
      {input}
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
  const dialog = useRef<HTMLDialogElement>(null);
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
          <ActionIcon
            aria-label={t('parameters.close')}
            icon={X}
            size="small"
            title={t('parameters.close')}
            onClick={onClose}
          />
        </header>
        <div className="rt-board">
          <Code2 aria-hidden size={17} />
          <div>
            <strong>{title}</strong>
            <code>{boardId}</code>
          </div>
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
          {state.schema && (
            <div className="rt-declaration">
              <span>{t('parameters.declaredBy')}</span>
              <Button
                icon={Code2}
                size="small"
                type="text"
                onClick={() => dialog.current?.showModal()}
              >
                {t('parameters.viewDeclaration')}
              </Button>
            </div>
          )}
        </div>
        <footer className="rt-footer">
          <span role="status">
            {changed ? t('parameters.changed', { count: changed }) : t('parameters.defaults')}
          </span>
          <Button disabled={!changed} icon={RotateCcw} size="small" type="text" onClick={onReset}>
            {t('parameters.reset')}
          </Button>
        </footer>
      </aside>
      <dialog
        aria-label={t('parameters.declaration')}
        className="rt-dialog"
        ref={dialog}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{t('parameters.declaration')}</h2>
          <ActionIcon
            aria-label={t('parameters.closeDeclaration')}
            icon={X}
            size="small"
            onClick={() => dialog.current?.close()}
          />
        </header>
        <pre tabIndex={0}>{JSON.stringify(state.schema, null, 2)}</pre>
        <h3>{t('parameters.currentValues')}</h3>
        <pre tabIndex={0}>{JSON.stringify(state.values, null, 2)}</pre>
        <p>{t('parameters.sessionOnly')}</p>
      </dialog>
    </IconProvider>
  );
}
