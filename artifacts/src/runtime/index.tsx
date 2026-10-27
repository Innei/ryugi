import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Block,
  Button,
  Checkbox,
  ColorPicker,
  ConfigProvider,
  Divider,
  DropdownMenu,
  Input,
  InputNumber,
  IconProvider,
  Popover,
  Progress,
  RadioGroup,
  Segmented,
  Select,
  Slider,
  SliderWithInput,
  Switch,
  Tag,
  Text,
  TextArea,
  Tooltip,
  ToastHost,
  setLobeTheme,
} from '@lobehub/ui';
import '@lobehub/ui/theme.css';
import '@lobehub/ui/style.css';
import '../shared/fonts.css';
import { type LucideProps } from 'lucide-react';
import { motion } from 'motion/react';
import { createElement, type ReactNode } from 'react';
import { type AttributeKind, readAttribute, styleObject } from './attrs';
import { createHostRoot } from './host';
import { artifactToast, createToastRoot } from './toast';

declare global {
  interface Window {
    ryugiToast: typeof artifactToast;
  }
}

const iconFor = (name: unknown) =>
  typeof name === 'string' && name
    ? ({ size = 16, strokeWidth = 2 }: LucideProps) =>
        createElement('ryugi-icon', { name, size, 'stroke-width': strokeWidth })
    : undefined;

interface Option {
  disabled?: boolean;
  icon?: string;
  label: string;
  value: string;
}

type RuntimeElement = HTMLElement & {
  checked: boolean;
  initialText: string;
  optionList: Option[];
  value: unknown;
  change: (value: unknown, checked?: boolean) => void;
};

interface Spec {
  attrs?: Record<string, { kind: AttributeKind; prop: string }>;
  checked?: boolean;
  control?: boolean;
  options?: string;
  tag: string;
  value?: 'number' | 'string';
  valueDefault?: number | string | null;
  view: (
    el: RuntimeElement,
    props: Record<string, unknown>,
    slot: (node: HTMLSpanElement | null) => void,
  ) => ReactNode;
}

let hosts: ReturnType<typeof createHostRoot>;

const BASE_ATTRS = [
  'class',
  'style',
  'title',
  'aria-label',
  'disabled',
  'name',
  'placeholder',
  'value',
  'checked',
];

class RyugiElement extends HTMLElement {
  static spec: Spec;

  #children: Node[] = [];
  #mounted = false;
  #options: Option[] = [];
  #slot: HTMLSpanElement | null = null;
  #text = '';
  #value: unknown;
  #checked = false;

  static get observedAttributes() {
    const spec = (this as typeof RyugiElement).spec;
    return [...new Set([...BASE_ATTRS, ...Object.keys(spec.attrs ?? {})])];
  }

  static specOf(el: HTMLElement) {
    return (el.constructor as typeof RyugiElement).spec;
  }

  get value() {
    return this.#value;
  }

  set value(next: unknown) {
    if (this.#value === next) return;
    this.#value = next;
    this.render();
  }

  get checked() {
    return this.#checked;
  }

  set checked(next: boolean) {
    if (this.#checked === next) return;
    this.#checked = next;
    this.render();
  }

  get optionList() {
    return this.#options;
  }

  get initialText() {
    return this.#text;
  }

  connectedCallback() {
    const spec = RyugiElement.specOf(this);
    if (!this.#mounted) {
      this.#mounted = true;
      this.#children = [...this.childNodes];
      this.#text = this.textContent ?? '';
      this.#value = this.#initialValue(spec);
      this.#checked = this.#initialChecked();
      if (spec.options) this.#options = this.#readOptions(spec.options);
      if (spec.control) this.setAttribute('data-ryugi-control', '');
      // A portal appends to its container instead of replacing it the way a root does.
      this.replaceChildren();
    }
    hosts.register(this, () =>
      spec.view(this as RuntimeElement, this.#props(spec), this.attachSlot),
    );
  }

  disconnectedCallback() {
    hosts.unregister(this);
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null) {
    if (!this.#mounted || previous === next) return;
    const spec = RyugiElement.specOf(this);
    if (name === 'value' && spec.value) this.#value = this.#initialValue(spec);
    if (name === 'checked' && spec.checked) this.#checked = this.#initialChecked();
    this.render();
  }

  change(value: unknown, checked?: boolean) {
    this.#value = value;
    if (checked !== undefined) this.#checked = checked;
    this.render();
    this.dispatchEvent(
      new CustomEvent('ryugi-change', {
        bubbles: true,
        detail: { value: this.#value, checked: this.#checked },
      }),
    );
  }

  attachSlot = (node: HTMLSpanElement | null) => {
    if (!node || node === this.#slot) return;
    this.#slot = node;
    node.append(...this.#children);
  };

  render() {
    hosts.update(this);
  }

  #initialChecked() {
    const raw = this.getAttribute('checked');
    return raw !== null && raw !== 'false';
  }

  #initialValue(spec: Spec) {
    if (spec.value === 'number') {
      const raw = this.getAttribute('value');
      if (raw === null) return spec.valueDefault ?? 0;
      const value = Number(raw);
      return Number.isFinite(value) ? value : (spec.valueDefault ?? 0);
    }
    if (spec.value === 'string') return this.getAttribute('value') ?? spec.valueDefault ?? '';
    return undefined;
  }

  #props(spec: Spec) {
    const props: Record<string, unknown> = {};
    for (const [attr, { kind, prop }] of Object.entries(spec.attrs ?? {})) {
      const value = readAttribute(this, attr, kind);
      if (value !== undefined) props[prop] = value;
    }
    const style = styleObject(this);
    if (style) props.style = style;
    const title = this.getAttribute('title');
    if (title) props.title = title;
    const ariaLabel = this.getAttribute('aria-label');
    if (ariaLabel) props['aria-label'] = ariaLabel;
    const placeholder = this.getAttribute('placeholder');
    if (placeholder) props.placeholder = placeholder;
    if (this.getAttribute('disabled') !== null && this.getAttribute('disabled') !== 'false')
      props.disabled = true;
    return props;
  }

  #readOptions(kind: string): Option[] {
    const tag =
      { select: 'ryugi-option', segmented: 'ryugi-segment', menu: 'ryugi-menu-item' }[kind] ??
      'ryugi-radio';
    return Array.from(this.querySelectorAll(`:scope > ${tag}`)).map((option) => ({
      disabled:
        option.getAttribute('disabled') !== null && option.getAttribute('disabled') !== 'false',
      icon: option.getAttribute('icon') ?? undefined,
      label: option.textContent?.trim() ?? '',
      value: option.getAttribute('value') ?? option.textContent?.trim() ?? '',
    }));
  }
}

const makeElement = (spec: Spec) => {
  class Element extends RyugiElement {}
  Element.spec = spec;
  return Element;
};

const buttonProps = (p: Record<string, unknown>) => {
  const { icon, ...props } = p as { icon?: string } & Record<string, unknown>;
  return { ...props, icon: iconFor(icon) };
};

const definitions: Spec[] = [
  {
    tag: 'ryugi-button',
    attrs: {
      block: { kind: 'boolean', prop: 'block' },
      icon: { kind: 'string', prop: 'icon' },
      loading: { kind: 'boolean', prop: 'loading' },
      shape: { kind: 'string', prop: 'shape' },
      size: { kind: 'string', prop: 'size' },
      type: { kind: 'string', prop: 'type' },
      variant: { kind: 'string', prop: 'variant' },
    },
    view: (_el, p, slot) => (
      <Button {...buttonProps(p)}>
        <span ref={slot} style={{ display: 'contents' }} />
      </Button>
    ),
  },
  {
    tag: 'ryugi-action-icon',
    attrs: {
      icon: { kind: 'string', prop: 'icon' },
      size: { kind: 'string', prop: 'size' },
    },
    view: (_el, p) => <ActionIcon {...buttonProps(p)} icon={iconFor(p.icon ?? 'plus')} />,
  },
  {
    tag: 'ryugi-tooltip',
    attrs: {
      content: { kind: 'string', prop: 'title' },
      placement: { kind: 'string', prop: 'placement' },
      open: { kind: 'boolean', prop: 'open' },
    },
    view: (_el, p, slot) => (
      <Tooltip title="" {...p}>
        <Button>
          <span ref={slot} style={{ display: 'contents' }} />
        </Button>
      </Tooltip>
    ),
  },
  {
    tag: 'ryugi-popover',
    attrs: {
      content: { kind: 'string', prop: 'content' },
      placement: { kind: 'string', prop: 'placement' },
      trigger: { kind: 'string', prop: 'trigger' },
    },
    view: (_el, p, slot) => (
      <Popover content="" trigger="click" {...p}>
        <Button>
          <span ref={slot} style={{ display: 'contents' }} />
        </Button>
      </Popover>
    ),
  },
  {
    tag: 'ryugi-menu',
    options: 'menu',
    attrs: {
      label: { kind: 'string', prop: 'label' },
      icon: { kind: 'string', prop: 'icon' },
      placement: { kind: 'string', prop: 'placement' },
    },
    view: (el, { label, icon, ...p }) => (
      <DropdownMenu
        {...p}
        items={el.optionList.map((option) => ({
          key: option.value,
          label: option.label,
          disabled: option.disabled,
          icon: iconFor(option.icon),
          onClick: () => el.change(option.value),
        }))}
      >
        <Button icon={iconFor(icon)}>{String(label ?? 'More')}</Button>
      </DropdownMenu>
    ),
  },
  {
    tag: 'ryugi-input',
    attrs: {
      allowClear: { kind: 'boolean', prop: 'allowClear' },
      size: { kind: 'string', prop: 'size' },
      type: { kind: 'string', prop: 'type' },
      variant: { kind: 'string', prop: 'variant' },
    },
    control: true,
    value: 'string',
    view: (el, p) => (
      <Input
        {...p}
        value={String(el.value)}
        onChange={(event) => el.change(event.currentTarget.value)}
      />
    ),
  },
  {
    tag: 'ryugi-textarea',
    attrs: {
      rows: { kind: 'number', prop: 'rows' },
      size: { kind: 'string', prop: 'size' },
      variant: { kind: 'string', prop: 'variant' },
    },
    control: true,
    value: 'string',
    view: (el, p) => (
      <TextArea
        {...p}
        value={String(el.value)}
        onChange={(event) => el.change(event.currentTarget.value)}
      />
    ),
  },
  {
    tag: 'ryugi-input-number',
    attrs: {
      controls: { kind: 'boolean', prop: 'controls' },
      max: { kind: 'number', prop: 'max' },
      min: { kind: 'number', prop: 'min' },
      precision: { kind: 'number', prop: 'precision' },
      size: { kind: 'string', prop: 'size' },
      step: { kind: 'number', prop: 'step' },
      variant: { kind: 'string', prop: 'variant' },
    },
    control: true,
    value: 'number',
    valueDefault: null,
    view: (el, p) => (
      <InputNumber
        {...p}
        value={el.value as number | null}
        onChange={(value) => el.change(value)}
      />
    ),
  },
  {
    tag: 'ryugi-slider',
    attrs: {
      max: { kind: 'number', prop: 'max' },
      min: { kind: 'number', prop: 'min' },
      step: { kind: 'number', prop: 'step' },
    },
    control: true,
    value: 'number',
    view: (el, p) => (
      <Slider {...p} value={Number(el.value)} onChange={(value) => el.change(value)} />
    ),
  },
  {
    tag: 'ryugi-slider-input',
    attrs: {
      controls: { kind: 'boolean', prop: 'controls' },
      max: { kind: 'number', prop: 'max' },
      min: { kind: 'number', prop: 'min' },
      size: { kind: 'string', prop: 'size' },
      step: { kind: 'number', prop: 'step' },
      variant: { kind: 'string', prop: 'variant' },
    },
    control: true,
    value: 'number',
    view: (el, p) => (
      <SliderWithInput {...p} value={Number(el.value)} onChange={(value) => el.change(value)} />
    ),
  },
  {
    tag: 'ryugi-switch',
    attrs: {
      loading: { kind: 'boolean', prop: 'loading' },
      size: { kind: 'string', prop: 'size' },
    },
    checked: true,
    control: true,
    view: (el, p) => (
      <Switch {...p} checked={el.checked} onChange={(checked) => el.change(checked, checked)} />
    ),
  },
  {
    tag: 'ryugi-checkbox',
    attrs: {
      shape: { kind: 'string', prop: 'shape' },
      size: { kind: 'number', prop: 'size' },
    },
    checked: true,
    control: true,
    view: (el, p, slot) => (
      <Checkbox {...p} checked={el.checked} onChange={(checked) => el.change(checked, checked)}>
        <span ref={slot} style={{ display: 'contents' }} />
      </Checkbox>
    ),
  },
  {
    tag: 'ryugi-segmented',
    attrs: {
      block: { kind: 'boolean', prop: 'block' },
      glass: { kind: 'boolean', prop: 'glass' },
      shadow: { kind: 'boolean', prop: 'shadow' },
      size: { kind: 'string', prop: 'size' },
      variant: { kind: 'string', prop: 'variant' },
      vertical: { kind: 'boolean', prop: 'vertical' },
    },
    control: true,
    options: 'segmented',
    value: 'string',
    view: (el, p) => (
      <Segmented
        {...p}
        options={el.optionList}
        value={String(el.value)}
        onChange={(value) => el.change(value)}
      />
    ),
  },
  {
    tag: 'ryugi-select',
    attrs: {
      allowClear: { kind: 'boolean', prop: 'allowClear' },
      loading: { kind: 'boolean', prop: 'loading' },
      mode: { kind: 'string', prop: 'mode' },
      showSearch: { kind: 'boolean', prop: 'showSearch' },
      size: { kind: 'string', prop: 'size' },
      variant: { kind: 'string', prop: 'variant' },
    },
    control: true,
    options: 'select',
    value: 'string',
    view: (el, p) => (
      <Select
        {...p}
        options={el.optionList}
        value={String(el.value) || null}
        onChange={(value) => el.change(value)}
      />
    ),
  },
  {
    tag: 'ryugi-radio-group',
    attrs: {
      gap: { kind: 'number', prop: 'gap' },
      horizontal: { kind: 'boolean', prop: 'horizontal' },
      size: { kind: 'number', prop: 'size' },
    },
    control: true,
    options: 'radio',
    value: 'string',
    view: (el, p) => (
      <RadioGroup
        {...p}
        options={el.optionList}
        value={String(el.value)}
        onChange={(value) => el.change(value)}
      />
    ),
  },
  {
    tag: 'ryugi-color-picker',
    attrs: {
      alpha: { kind: 'boolean', prop: 'alpha' },
      defaultFormat: { kind: 'string', prop: 'defaultFormat' },
      size: { kind: 'string', prop: 'size' },
      trigger: { kind: 'string', prop: 'trigger' },
    },
    control: true,
    value: 'string',
    valueDefault: '#000000',
    view: (el, p) => (
      <ColorPicker {...p} value={String(el.value)} onChange={(value) => el.change(value)} />
    ),
  },
  {
    tag: 'ryugi-tag',
    attrs: {
      closable: { kind: 'boolean', prop: 'closable' },
      color: { kind: 'string', prop: 'color' },
      shape: { kind: 'string', prop: 'shape' },
      size: { kind: 'string', prop: 'size' },
      variant: { kind: 'string', prop: 'variant' },
    },
    view: (_el, p, slot) => (
      <Tag {...p}>
        <span ref={slot} style={{ display: 'contents' }} />
      </Tag>
    ),
  },
  {
    tag: 'ryugi-alert',
    attrs: {
      closable: { kind: 'boolean', prop: 'closable' },
      description: { kind: 'string', prop: 'description' },
      showIcon: { kind: 'boolean', prop: 'showIcon' },
      type: { kind: 'string', prop: 'type' },
      variant: { kind: 'string', prop: 'variant' },
    },
    view: (el, p) => <Alert {...p} title={(p.title as string | undefined) ?? el.initialText} />,
  },
  {
    tag: 'ryugi-progress',
    attrs: {
      percent: { kind: 'number', prop: 'percent' },
      size: { kind: 'string', prop: 'size' },
      status: { kind: 'string', prop: 'status' },
    },
    view: (_el, p) => <Progress percent={0} {...p} />,
  },
  {
    tag: 'ryugi-badge',
    attrs: {
      color: { kind: 'string', prop: 'color' },
      count: { kind: 'string', prop: 'count' },
      dot: { kind: 'boolean', prop: 'dot' },
      showZero: { kind: 'boolean', prop: 'showZero' },
      size: { kind: 'string', prop: 'size' },
      status: { kind: 'string', prop: 'status' },
      text: { kind: 'string', prop: 'text' },
    },
    view: (el, p, slot) => (
      <Badge {...p} text={(p.text as string | undefined) ?? el.initialText}>
        <span ref={slot} style={{ display: 'contents' }} />
      </Badge>
    ),
  },
  {
    tag: 'ryugi-avatar',
    attrs: {
      alt: { kind: 'string', prop: 'alt' },
      shape: { kind: 'string', prop: 'shape' },
      size: { kind: 'number', prop: 'size' },
      src: { kind: 'string', prop: 'src' },
    },
    view: (_el, p) => <Avatar {...p} />,
  },
  {
    tag: 'ryugi-divider',
    attrs: {
      dashed: { kind: 'boolean', prop: 'dashed' },
      orientation: { kind: 'string', prop: 'orientation' },
    },
    view: (_el, p) => <Divider {...p} />,
  },
  {
    tag: 'ryugi-card',
    attrs: {
      clickable: { kind: 'boolean', prop: 'clickable' },
      glass: { kind: 'boolean', prop: 'glass' },
      shadow: { kind: 'boolean', prop: 'shadow' },
      variant: { kind: 'string', prop: 'variant' },
    },
    view: (_el, p, slot) => (
      <Block {...p}>
        <span ref={slot} style={{ display: 'contents' }} />
      </Block>
    ),
  },
  {
    tag: 'ryugi-text',
    attrs: {
      align: { kind: 'string', prop: 'align' },
      code: { kind: 'boolean', prop: 'code' },
      delete: { kind: 'boolean', prop: 'delete' },
      italic: { kind: 'boolean', prop: 'italic' },
      mark: { kind: 'boolean', prop: 'mark' },
      strong: { kind: 'boolean', prop: 'strong' },
      type: { kind: 'string', prop: 'type' },
      underline: { kind: 'boolean', prop: 'underline' },
      weight: { kind: 'string', prop: 'weight' },
    },
    view: (_el, p, slot) => (
      <Text {...p}>
        <span ref={slot} style={{ display: 'contents' }} />
      </Text>
    ),
  },
];

const HOST_CSS = `
ryugi-button,ryugi-action-icon,ryugi-input,ryugi-textarea,ryugi-input-number,ryugi-slider,ryugi-slider-input,ryugi-switch,ryugi-checkbox,ryugi-segmented,ryugi-select,ryugi-radio-group,ryugi-color-picker,ryugi-tag,ryugi-badge,ryugi-avatar,ryugi-tooltip,ryugi-popover,ryugi-menu{display:inline-block;vertical-align:middle}
ryugi-card,ryugi-alert,ryugi-progress,ryugi-divider,ryugi-text{display:block}
`;

const reportError = (error: unknown) => {
  console.error('[ryugi-ui]', error);
  window.dispatchEvent(new ErrorEvent('error', { error, message: String(error) }));
};

if (typeof window !== 'undefined' && !customElements.get('ryugi-button')) {
  const pageTheme = document.documentElement.dataset.theme;
  const applyTheme = () =>
    setLobeTheme({
      appearance:
        pageTheme === 'light' || pageTheme === 'dark'
          ? pageTheme
          : matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light',
    });
  const style = document.createElement('style');
  style.dataset.ryugiUi = '';
  style.textContent = HOST_CSS;
  document.head.append(style);
  applyTheme();
  const toastRoot = createToastRoot();
  hosts = createHostRoot({
    wrap: (children) => (
      <ConfigProvider motion={motion} enableCustomFonts={false}>
        <IconProvider config={{ 'aria-hidden': true }}>
          {children}
          <ToastHost root={toastRoot} className="ryugi-toast-viewport" />
        </IconProvider>
      </ConfigProvider>
    ),
    onError: reportError,
  });
  const query = matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', applyTheme);
  for (const spec of definitions) {
    if (!customElements.get(spec.tag)) customElements.define(spec.tag, makeElement(spec));
  }
  window.ryugiToast = artifactToast;
  document.dispatchEvent(new CustomEvent('ryugi-ui:ready'));
}
