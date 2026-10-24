import { Accordion, ColorPicker, Input, InputNumber, Segmented, Select } from '@lobehub/ui';
import { ArrowDown, ArrowRight, Ban, Ellipsis, Minus, SquareDashed } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import type { InspectorProperty, InspectorSelection } from '../../shared/inspector';
import { t } from '../i18n';

interface Props { node: InspectorSelection; change: (property: InspectorProperty, value: string) => void }
const numeric = (value: string) => Number.isFinite(parseFloat(value)) ? Math.round(parseFloat(value) * 100) / 100 : 0;
const options = (values: [string, ReactNode][]) => values.map(([value, label]) => ({ value, label }));
const pickerColor = (value: string) => {
  const rgb = value.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
  return rgb ? '#' + rgb.slice(1).filter((part) => part !== undefined).map((part, index) => Math.round(Number(part) * (index === 3 ? 255 : 1)).toString(16).padStart(2, '0')).join('') : value;
};

function Field({ label, children, controlId }: { label: string; children: ReactNode; controlId?: string }) {
  return <div className="ri-field">{controlId ? <label className="ri-field-label" htmlFor={controlId}>{label}</label> : <span className="ri-field-label">{label}</span>}{children}</div>;
}

function NumberField({ label, property, node, change, unit = 'px', max, min = 0, step = 1, sizing }: Props & { label: string; property: InspectorProperty; unit?: string; max?: number; min?: number; step?: number; sizing?: ReactNode }) {
  const controlId = useId();
  const input = <InputNumber id={controlId} size="small" controls={false} value={numeric(node.css[property])} suffix={unit || undefined} min={min} max={max} step={step} onChange={(value) => { if (value !== null) change(property, String(value) + unit); }} style={{ width: '100%' }} />;
  return <Field label={label} controlId={controlId}>{sizing ? <div className="ri-number-sizing"><div className="ri-size-input">{input}</div><div className="ri-size-mode">{sizing}</div></div> : input}</Field>;
}

function Choice({ label, property, values, node, change }: Props & { label: string; property: InspectorProperty; values: [string, ReactNode][] }) {
  const controlId = useId();
  const value = node.css[property];
  const available = values.some(([key]) => key === value) ? values : [...values, [value, value] as [string, string]];
  return <Field label={label} controlId={controlId}><Select size="small" id={controlId} value={value} options={options(available)} onChange={(next) => { if (typeof next === 'string') change(property, next); }} style={{ width: '100%' }} /></Field>;
}

export function Properties({ node, change }: Props) {
  const props = { node, change };
  const widthSizing = useId();
  const heightSizing = useId();
  const [shadow, setShadow] = useState(node.css['box-shadow']);
  useEffect(() => setShadow(node.css['box-shadow']), [node.css['box-shadow']]);
  return (
    <>
      <section className="ri-section"><h2>{t('inspector.size')}</h2>
        <NumberField {...props} label={t('inspector.width')} property="width" sizing={<><label className="ri-sr-only" htmlFor={widthSizing}>{t('inspector.widthSizing')}</label><Select id={widthSizing} size="small" value={node.widthMode} options={options([['fixed', t('inspector.fixed')], ['fill', t('inspector.fill')], ['hug', t('inspector.hug')]])} onChange={(mode) => change('width', mode === 'fill' ? '100%' : mode === 'hug' ? 'max-content' : `${numeric(node.css.width) || node.rect.width}px`)} /></>} />
        <NumberField {...props} label={t('inspector.height')} property="height" sizing={<><label className="ri-sr-only" htmlFor={heightSizing}>{t('inspector.heightSizing')}</label><Select id={heightSizing} size="small" value={node.heightMode} options={options([['hug', t('inspector.hug')], ['fixed', t('inspector.fixed')]])} onChange={(mode) => change('height', mode === 'hug' ? 'auto' : `${numeric(node.css.height) || node.rect.height}px`)} /></>} />
        <Choice {...props} label={t('inspector.position')} property="position" values={[[ 'static', t('inspector.inline') ], [ 'relative', t('inspector.relative') ], [ 'absolute', t('inspector.absolute') ], [ 'fixed', t('inspector.fixed') ], [ 'sticky', t('inspector.sticky') ]]} />
        <NumberField {...props} label={t('inspector.grow')} property="flex-grow" unit="" max={100} />
      </section>
      <section className="ri-section"><h2>{t('inspector.layout')}</h2>
        <Choice {...props} label={t('inspector.layout')} property="display" values={[[ 'flex', t('inspector.stack') ], [ 'grid', t('inspector.grid') ], [ 'block', t('inspector.block') ], [ 'inline', t('inspector.inline') ], [ 'inline-flex', t('inspector.inlineStack') ], [ 'none', t('inspector.hidden') ]]} />
        {(node.css.display === 'flex' || node.css.display === 'inline-flex') && <>
          <Field label={t('inspector.direction')}><Segmented size="small" block value={node.css['flex-direction']} options={[{ value: 'row', icon: <ArrowRight size={14} aria-hidden />, label: <span className="ri-sr-only">{t('inspector.horizontal')}</span>, title: t('inspector.horizontal') }, { value: 'column', icon: <ArrowDown size={14} aria-hidden />, label: <span className="ri-sr-only">{t('inspector.vertical')}</span>, title: t('inspector.vertical') }]} onChange={(value) => change('flex-direction', value)} /></Field>
          <Field label={t('inspector.align')}><Segmented size="small" block aria-label={t('inspector.align')} value={node.css['align-items']} options={options([['flex-start', t('inspector.start')], ['center', t('inspector.center')], ['stretch', t('inspector.fill')]])} onChange={(value) => change('align-items', value)} /></Field>
        </>}
        <NumberField {...props} label={t('inspector.gap')} property="gap" />
        <NumberField {...props} label={t('inspector.padding')} property="padding" />
      </section>
      <section className="ri-section"><h2>{t('inspector.appearance')}</h2>
        <Field label={t('inspector.fill')}><ColorPicker size="small" trigger="field" alpha recent={false} value={pickerColor(node.css['background-color'])} onChange={(value) => change('background-color', value)} /></Field>
        <NumberField {...props} label={t('inspector.opacity')} property="opacity" unit="" max={1} step={0.1} />
        <NumberField {...props} label={t('inspector.radius')} property="border-radius" />
        <Choice {...props} label={t('inspector.border')} property="border-style" values={[[ 'none', <span className="ri-option"><Ban size={13} aria-hidden />{t('inspector.none')}</span> ], [ 'solid', <span className="ri-option"><Minus size={13} aria-hidden />{t('inspector.solid')}</span> ], [ 'dashed', <span className="ri-option"><SquareDashed size={13} aria-hidden />{t('inspector.dashed')}</span> ], [ 'dotted', <span className="ri-option"><Ellipsis size={13} aria-hidden />{t('inspector.dotted')}</span> ]]} />
      </section>
      <Accordion indicatorPlacement="end" gap={0} keepMounted classNames={{ item: 'ri-section' }} styles={{ header: { margin: 0 }, trigger: { padding: 0, fontSize: 13, fontWeight: 550 }, content: { padding: '12px 0 0' } }} items={[
        { key: 'typography', title: t('inspector.typography'), children: <>
          <NumberField {...props} label={t('inspector.fontSize')} property="font-size" min={1} />
          <Field label={t('inspector.color')}><ColorPicker size="small" trigger="field" alpha recent={false} value={pickerColor(node.css.color)} onChange={(value) => change('color', value)} /></Field>
        </> },
        { key: 'effects', title: t('inspector.effects'), children: <Field label={t('inspector.shadow')}><Input aria-label={t('inspector.shadow')} size="small" value={shadow} onChange={(event) => setShadow(event.target.value)} onBlur={() => change('box-shadow', shadow)} onPressEnter={(event) => event.currentTarget.blur()} /></Field> },
      ]} />
    </>
  );
}
