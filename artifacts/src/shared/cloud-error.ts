export interface CloudErrorDetails {
  code?: string;
  plan?: 'free' | 'pro';
  limit?: { kind: string; used: number; max: number; requested?: number };
  upgradeUrl?: string;
}

export function cloudErrorDetails(value: unknown): CloudErrorDetails {
  if (!value || typeof value !== 'object') return {};
  const fields = value as Record<string, unknown>;
  const details: CloudErrorDetails = {};
  if (typeof fields.code === 'string') details.code = fields.code;
  if (fields.plan === 'free' || fields.plan === 'pro') details.plan = fields.plan;
  if (typeof fields.upgradeUrl === 'string') details.upgradeUrl = fields.upgradeUrl;
  if (fields.limit && typeof fields.limit === 'object') {
    const limit = fields.limit as Record<string, unknown>;
    if (
      typeof limit.kind === 'string' &&
      typeof limit.used === 'number' &&
      Number.isFinite(limit.used) &&
      limit.used >= 0 &&
      typeof limit.max === 'number' &&
      Number.isFinite(limit.max) &&
      limit.max >= 0
    ) {
      details.limit = { kind: limit.kind, used: limit.used, max: limit.max };
      if (
        typeof limit.requested === 'number' &&
        Number.isFinite(limit.requested) &&
        limit.requested >= 0
      )
        details.limit.requested = limit.requested;
    }
  }
  return details;
}
