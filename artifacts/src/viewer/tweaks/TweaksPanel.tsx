import '../panels.css';

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
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Code2, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import type { TweakControl, TweakValue } from '../../shared/tweaks';
import type { Rect } from '../../shared/types';
import type { BoardTweakState } from '../hooks/useBoardTweaks';
import { t } from '../i18n';
import { isComposing } from '../lib/keyboard';
import type { View } from '../lib/view';

const styles = stylex.create({
  panel: {
    zIndex: 15,
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorder,
    borderRadius: 12,
    backgroundColor: cssVar.colorBgContainer,
    color: cssVar.colorText,
    boxShadow: cssVar.boxShadowSecondary,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    cursor: 'default',
    userSelect: 'text',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  header: {
    height: 44,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingInlineStart: 16,
    paddingInlineEnd: 10,
    boxSizing: 'border-box',
  },
  headerTitle: { fontSize: 12, fontWeight: 600, margin: 0 },
  headerIcon: { color: cssVar.colorTextSecondary },
  headerAction: { marginInlineStart: 'auto' },
  count: { fontSize: 10, color: cssVar.colorTextSecondary, marginInlineStart: -3 },
  board: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    paddingInline: 16,
    paddingBlockEnd: 13,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    flexShrink: 0,
    minWidth: 0,
    boxSizing: 'border-box',
  },
  boardTitle: {
    minWidth: 0,
    fontSize: 12,
    fontWeight: 550,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  boardId: {
    minWidth: 0,
    fontSize: 10,
    color: cssVar.colorTextSecondary,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  boardNote: {
    marginInlineStart: 'auto',
    flexShrink: 0,
    fontSize: 9,
    color: cssVar.colorTextSecondary,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'thin',
  },
  section: {
    paddingBlockStart: 15,
    paddingBlockEnd: 12,
    paddingInline: 16,
    boxSizing: 'border-box',
  },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: cssVar.colorBorderSecondary,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 550,
    color: cssVar.colorTextSecondary,
    marginBlockStart: 0,
    marginBlockEnd: 7,
  },
  field: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: '76px minmax(0, 1fr)',
    alignItems: 'center',
    columnGap: 12,
    minHeight: 44,
    boxSizing: 'border-box',
  },
  fieldSet: {
    display: 'block',
    borderWidth: 0,
    paddingBlock: 6,
    paddingInlineStart: 88,
    paddingInlineEnd: 0,
    minWidth: 0,
    margin: 0,
  },
  fieldLabel: {
    fontSize: 11,
    lineHeight: 1.5,
    color: cssVar.colorTextSecondary,
    overflowWrap: 'anywhere',
  },
  fieldLabelChanged: {
    'color': cssVar.colorText,
    '::after': {
      content: '',
      display: 'inline-block',
      width: 4,
      height: 4,
      borderRadius: '50%',
      marginInlineStart: 5,
      verticalAlign: 'middle',
      backgroundColor: cssVar.colorWarning,
    },
  },
  legend: {
    position: 'absolute',
    top: '50%',
    left: 0,
    transform: 'translateY(-50%)',
    width: 76,
    margin: 0,
    padding: 0,
    boxSizing: 'border-box',
  },
  control: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 },
  input: { flex: 1, minWidth: 0 },
  switch: { display: 'block', marginInlineStart: 'auto' },
  fieldReset: { flexShrink: 0 },
  fieldResetHidden: { visibility: 'hidden' },
  range: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  rangeSlider: { flex: 1, minWidth: 0 },
  color: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  colorButton: { minWidth: 0, flex: 1, paddingInline: 7 },
  colorCode: { fontSize: 10 },
  swatches: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    maxWidth: 72,
    flexShrink: 0,
    overflowX: 'auto',
    paddingBlock: 3,
    paddingInline: 2,
    scrollbarWidth: 'thin',
  },
  swatch: {
    'width': 18,
    'height': 18,
    'boxSizing': 'border-box',
    'flexShrink': 0,
    'borderWidth': 2,
    'borderStyle': 'solid',
    'borderColor': cssVar.colorBgContainer,
    'borderRadius': 5,
    'padding': 0,
    'cursor': 'pointer',
    ':focus-visible': {
      outlineWidth: 2,
      outlineStyle: 'solid',
      outlineColor: cssVar.colorPrimary,
      outlineOffset: 1,
    },
  },
  swatchOn: {
    outlineWidth: 1,
    outlineStyle: 'solid',
    outlineColor: cssVar.colorTextSecondary,
    outlineOffset: 1,
  },
  chip: {
    display: 'inline-block',
    width: 12,
    height: 12,
    boxSizing: 'border-box',
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorderSecondary,
    flexShrink: 0,
  },
  footer: {
    minHeight: 44,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    paddingBlock: 5,
    paddingInlineStart: 16,
    paddingInlineEnd: 8,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: cssVar.colorBorderSecondary,
    boxSizing: 'border-box',
  },
  footerText: {
    'flex': 1,
    'minWidth': 0,
    'fontSize': 10,
    'color': cssVar.colorTextSecondary,
    '::before': {
      content: '',
      display: 'inline-block',
      width: 4,
      height: 4,
      marginInlineEnd: 5,
      borderRadius: '50%',
      backgroundColor: cssVar.colorTextQuaternary,
      verticalAlign: 'middle',
    },
  },
  footerChanged: {
    '::before': { backgroundColor: cssVar.colorWarning },
  },
  footerButton: { fontSize: 10, paddingInline: 5 },
  error: {
    margin: 0,
    padding: 16,
    fontSize: 12,
    lineHeight: 1.7,
    color: cssVar.colorErrorText,
    overflowWrap: 'anywhere',
  },
  dialog: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    minHeight: 0,
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
  },
  dialogHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    height: 64,
    paddingInline: 20,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    boxSizing: 'border-box',
  },
  dialogIcon: { color: cssVar.colorTextSecondary, flexShrink: 0 },
  dialogTitle: { fontSize: 14, fontWeight: 600, margin: 0 },
  dialogCode: {
    marginInlineStart: 'auto',
    fontSize: 10,
    color: cssVar.colorTextSecondary,
    maxWidth: '30%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  codeToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    paddingInline: 20,
    minHeight: 46,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    boxSizing: 'border-box',
  },
  codeTabs: { display: 'flex', alignItems: 'center', gap: 20, minHeight: 46 },
  codeTab: {
    paddingBlock: 13,
    paddingInline: 0,
    borderWidth: 0,
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    backgroundColor: 'transparent',
    color: cssVar.colorTextSecondary,
    fontFamily: 'inherit',
    fontSize: 11,
    cursor: 'pointer',
  },
  codeTabOn: { color: cssVar.colorText, borderBottomColor: cssVar.colorText },
  toolbarButton: { marginInlineStart: 'auto' },
  codeContent: {
    minHeight: 0,
    flex: 1,
    paddingBlock: 18,
    paddingInline: 22,
    overflow: 'auto',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'thin',
  },
  code: {
    fontFamily: cssVar.fontFamilyCode,
    fontSize: 11,
    lineHeight: 1.9,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    margin: 0,
    color: cssVar.colorTextSecondary,
  },
  description: {
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: cssVar.colorBorderSecondary,
    paddingBlock: 13,
    paddingInline: 20,
    fontSize: 10,
    color: cssVar.colorTextSecondary,
    lineHeight: 1.6,
    margin: 0,
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
});

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
    <Field.Root style={{ width: width ?? '100%', flexShrink: 0 }}>
      <Field.Label {...stylex.props(styles.srOnly)}>{control.label}</Field.Label>
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
      <div {...stylex.props(styles.color)}>
        {control.options && (
          <div aria-label={control.label} role="group" {...stylex.props(styles.swatches)}>
            {control.options.map((option) => (
              <button
                aria-label={`${control.label}: ${option.label}`}
                aria-pressed={value === option.value}
                key={option.value}
                style={{ backgroundColor: option.value }}
                type="button"
                {...stylex.props(styles.swatch, value === option.value && styles.swatchOn)}
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
          <Button
            aria-label={control.label}
            className={stylex.props(styles.colorButton).className}
            id={id}
            size="small"
          >
            <span style={{ backgroundColor: value as string }} {...stylex.props(styles.chip)} />
            <code {...stylex.props(styles.colorCode)}>{String(value)}</code>
          </Button>
        </ColorPicker>
      </div>
    );
  else if (control.type === 'boolean')
    input = (
      <Switch
        aria-label={control.label}
        checked={value as boolean}
        className={stylex.props(styles.switch).className}
        id={id}
        onChange={change}
      />
    );
  else if (control.type === 'range')
    input = (
      <div {...stylex.props(styles.range)}>
        <Slider
          aria-labelledby={`${id}-label`}
          className={stylex.props(styles.rangeSlider).className}
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
  const changed = value !== control.default;
  return (
    <Field
      data-changed={changed || undefined}
      {...stylex.props(styles.field, segmented && styles.fieldSet)}
    >
      {segmented ? (
        <legend
          {...stylex.props(styles.fieldLabel, styles.legend, changed && styles.fieldLabelChanged)}
        >
          {control.label}
        </legend>
      ) : control.type === 'range' ? (
        <span
          id={`${id}-label`}
          {...stylex.props(styles.fieldLabel, changed && styles.fieldLabelChanged)}
        >
          {control.label}
        </span>
      ) : (
        <label
          htmlFor={id}
          {...stylex.props(styles.fieldLabel, changed && styles.fieldLabelChanged)}
        >
          {control.label}
        </label>
      )}
      <div {...stylex.props(styles.control)}>
        <div {...stylex.props(styles.input)}>{input}</div>
        <ActionIcon
          aria-label={t('parameters.resetControl', { label: control.label })}
          className={stylex.props(styles.fieldReset, !changed && styles.fieldResetHidden).className}
          disabled={!changed}
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
  const panelClass = [stylex.props(styles.panel).className, 'ryugi-parameters']
    .filter(Boolean)
    .join(' ');
  return (
    <IconProvider config={{ 'aria-hidden': true }}>
      <aside
        aria-label={t('parameters.title')}
        className={panelClass}
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
        <header {...stylex.props(styles.header)}>
          <SlidersHorizontal aria-hidden size={15} {...stylex.props(styles.headerIcon)} />
          <h2 {...stylex.props(styles.headerTitle)}>{t('parameters.title')}</h2>
          <span {...stylex.props(styles.count)}>
            {Object.keys(state.schema?.controls ?? {}).length}
          </span>
          <ActionIcon
            aria-label={t('parameters.close')}
            className={stylex.props(styles.headerAction).className}
            icon={X}
            size="small"
            title={t('parameters.close')}
            onClick={onClose}
          />
        </header>
        <div {...stylex.props(styles.board)}>
          <strong title={title} {...stylex.props(styles.boardTitle)}>
            {title}
          </strong>
          <code title={boardId} {...stylex.props(styles.boardId)}>
            {boardId}
          </code>
          <span {...stylex.props(styles.boardNote)}>{t('parameters.currentBoard')}</span>
        </div>
        <div {...stylex.props(styles.body)}>
          {state.error && (
            <p {...stylex.props(styles.error)} role="alert">
              {state.error}
            </p>
          )}
          {[...groups].map(([name, controls], index) => (
            <section
              key={name}
              {...stylex.props(styles.section, index > 0 && styles.sectionDivider)}
            >
              <h3 {...stylex.props(styles.sectionTitle)}>{name}</h3>
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
        <footer data-tweaks-footer="" {...stylex.props(styles.footer)}>
          <span
            role="status"
            {...stylex.props(styles.footerText, changed > 0 && styles.footerChanged)}
          >
            {changed ? t('parameters.changed', { count: changed }) : t('parameters.defaults')}
          </span>
          <Button
            className={stylex.props(styles.footerButton).className}
            disabled={!changed}
            icon={RotateCcw}
            size="small"
            type="text"
            onClick={onReset}
          >
            {t('parameters.reset')}
          </Button>
          {state.schema && (
            <Button
              aria-haspopup="dialog"
              className={stylex.props(styles.footerButton).className}
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
              data-chrome="parameter-declaration"
              className={[stylex.props(styles.dialog).className, 'rt-dialog']
                .filter(Boolean)
                .join(' ')}
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
              <header {...stylex.props(styles.dialogHeader)}>
                <Code2 aria-hidden size={17} {...stylex.props(styles.dialogIcon)} />
                <ModalTitle id={`${declarationId}-title`} {...stylex.props(styles.dialogTitle)}>
                  {t('parameters.declaration')}
                </ModalTitle>
                <code {...stylex.props(styles.dialogCode)}>{boardId}</code>
                <ActionIcon
                  aria-label={t('parameters.closeDeclaration')}
                  icon={X}
                  size="small"
                  onClick={() => setDeclarationOpen(false)}
                />
              </header>
              <div {...stylex.props(styles.codeToolbar)}>
                <div
                  aria-label={t('parameters.declaration')}
                  role="tablist"
                  {...stylex.props(styles.codeTabs)}
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
                      {...stylex.props(styles.codeTab, declarationTab === tab && styles.codeTabOn)}
                      onClick={() => setDeclarationTab(tab)}
                    >
                      {tab === 'schema' ? t('parameters.schema') : t('parameters.currentValues')}
                    </button>
                  ))}
                </div>
                <CopyButton
                  aria-label={t('parameters.copy')}
                  className={stylex.props(styles.toolbarButton).className}
                  content={declaration}
                  size="small"
                  title={t('parameters.copy')}
                />
              </div>
              <div {...stylex.props(styles.codeContent)}>
                <pre
                  aria-label={declarationLabel}
                  aria-labelledby={`${declarationId}-${declarationTab}`}
                  id={`${declarationId}-code`}
                  role="tabpanel"
                  tabIndex={0}
                  {...stylex.props(styles.code)}
                >
                  {declaration}
                </pre>
              </div>
              <ModalDescription {...stylex.props(styles.description)}>
                {t('parameters.sessionOnly')}
              </ModalDescription>
            </div>
          </ModalPopup>
        </ModalPortal>
      </ModalRoot>
    </IconProvider>
  );
}
