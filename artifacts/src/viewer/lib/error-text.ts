import { i18n } from '../i18n';
import type { PlanLimit } from './cloud-shell';

export function errorText(code: unknown, fallback: string): string {
  return typeof code === 'string' && i18n.exists(`errors.${code}`) ? i18n.t(`errors.${code}`) : fallback;
}

export const isPlanLimit = (value: unknown): value is PlanLimit =>
  typeof value === 'object' && value !== null && ['private', 'public', 'total', 'publishes'].includes((value as PlanLimit).kind) && typeof (value as PlanLimit).max === 'number';

export function planLimitMessage({ kind, max }: PlanLimit) {
  return i18n.t(`planLimit.${kind}`, { max });
}

export function responseErrorText(body: Record<string, unknown>, fallback: string): string {
  if (body.code === 'plan_limit' && isPlanLimit(body.limit)) return planLimitMessage(body.limit);
  return errorText(body.code, typeof body.error === 'string' ? body.error : fallback);
}
