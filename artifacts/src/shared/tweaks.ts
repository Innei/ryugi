export type TweakValue = string | number | boolean;
export type TweakValues = Record<string, TweakValue>;
export interface TweakControl {
  default: TweakValue;
  label: string;
  max?: number;
  min?: number;
  options?: { value: string; label: string }[];
  section?: string;
  step?: number;
  type: 'color' | 'range' | 'number' | 'boolean' | 'enum' | 'text';
}
export interface TweakSchema {
  controls: Record<string, TweakControl>;
  version: 1;
}
export interface TweakDeclaration {
  error: string | null;
  schema: TweakSchema | null;
}

// Self-contained so the host and serialized iframe runtime use identical validation.
export function tweakTools() {
  const object = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
  const text = (value: unknown, max = 512): value is string =>
    typeof value === 'string' && value.length <= max;
  const number = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9;
  const color = (value: unknown): value is string =>
    typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
  function valid(control: TweakControl, value: unknown): value is TweakValue {
    if (control.type === 'text') return text(value);
    if (control.type === 'color') return color(value);
    if (control.type === 'boolean') return typeof value === 'boolean';
    if (control.type === 'enum')
      return (
        typeof value === 'string' && !!control.options?.some((option) => option.value === value)
      );
    if (
      !number(value) ||
      (control.min !== undefined && value < control.min) ||
      (control.max !== undefined && value > control.max)
    )
      return false;
    const steps = control.step === undefined ? 0 : (value - (control.min ?? 0)) / control.step;
    return Math.abs(steps - Math.round(steps)) < 1e-7;
  }

  function readTweakSchema(input: unknown): TweakDeclaration {
    if (input === null) return { schema: null, error: null };
    const fail = (message: string): TweakDeclaration => ({ schema: null, error: message });
    if (!object(input) || input.version !== 1 || !object(input.controls))
      return fail('Expected version 1 and a controls object.');
    const entries = Object.entries(input.controls);
    if (entries.length > 32) return fail('Declare at most 32 parameters.');
    const controls: [string, TweakControl][] = [];
    const keys = new Set<string>();
    for (const [key, raw] of entries) {
      const bad = (message: string) => fail(`Parameter ${key.slice(0, 64)}: ${message}`);
      if (!/^[A-Z][\w-]{0,63}$/i.test(key) || ['constructor', 'prototype'].includes(key))
        return bad('invalid key.');
      if (keys.has(key.toLowerCase())) return bad('duplicate case-insensitive key.');
      keys.add(key.toLowerCase());
      if (
        !object(raw) ||
        !['color', 'range', 'number', 'boolean', 'enum', 'text'].includes(String(raw.type))
      )
        return bad('unsupported type.');
      if (raw.label !== undefined && !text(raw.label, 128)) return bad('label must be short text.');
      if (raw.section !== undefined && !text(raw.section, 128))
        return bad('section must be short text.');
      const control: TweakControl = {
        type: raw.type as TweakControl['type'],
        label: (raw.label as string) ?? key,
        default: raw.default as TweakValue,
      };
      if (raw.section !== undefined) control.section = raw.section as string;
      if (control.type === 'number' || control.type === 'range') {
        for (const field of ['min', 'max', 'step'] as const) {
          if (raw[field] !== undefined) {
            if (!number(raw[field])) return bad(`${field} must be a finite number.`);
            control[field] = raw[field];
          }
        }
        if (control.type === 'range') {
          if (control.min === undefined || control.max === undefined)
            return bad('range needs min and max.');
          control.step ??= 1;
        }
        if (
          (control.min !== undefined && control.max !== undefined && control.min >= control.max) ||
          (control.step !== undefined && control.step < 1e-6)
        )
          return bad('invalid bounds or step.');
      }
      if (control.type === 'enum' || (control.type === 'color' && raw.options !== undefined)) {
        if (!Array.isArray(raw.options) || !raw.options.length || raw.options.length > 32)
          return bad('options must contain 1–32 choices.');
        const options: { value: string; label: string }[] = [];
        for (const option of raw.options) {
          const value = typeof option === 'string' ? option : object(option) ? option.value : null;
          const label =
            typeof option === 'string' ? option : object(option) ? (option.label ?? value) : null;
          if (
            !text(value) ||
            !text(label, 128) ||
            (control.type === 'color' && !color(value)) ||
            options.some((entry) => entry.value === value)
          )
            return bad('invalid or duplicate option.');
          options.push({ value, label });
        }
        control.options = options;
      }
      if (!valid(control, control.default))
        return bad('default does not match its type, options or bounds.');
      controls.push([key, control]);
    }
    return { schema: { version: 1, controls: Object.fromEntries(controls) }, error: null };
  }

  function readTweakValues(schema: TweakSchema, input: unknown): TweakValues | null {
    if (!object(input) || Object.keys(input).length !== Object.keys(schema.controls).length)
      return null;
    const entries: [string, TweakValue][] = [];
    for (const [key, control] of Object.entries(schema.controls)) {
      if (!Object.hasOwn(input, key) || !valid(control, input[key])) return null;
      entries.push([key, input[key] as TweakValue]);
    }
    return Object.fromEntries(entries);
  }

  function reconcileTweakValues(
    schema: TweakSchema,
    previous: TweakValues = {},
    previousSchema?: TweakSchema,
  ): TweakValues {
    return Object.fromEntries(
      Object.entries(schema.controls).map(([key, control]) => {
        const value = previous[key];
        const changed = !previousSchema || value !== previousSchema.controls[key]?.default;
        return [key, changed && valid(control, value) ? value : control.default];
      }),
    );
  }
  return { readTweakSchema, readTweakValues, reconcileTweakValues };
}

export const { readTweakSchema, readTweakValues, reconcileTweakValues } = tweakTools();
