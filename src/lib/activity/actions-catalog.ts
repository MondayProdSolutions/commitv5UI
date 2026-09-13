import { KNOWN_ACTIONS, actionLabel } from '@/lib/audit';

export const AUDIT_ACTIONS = KNOWN_ACTIONS.map((value) => ({
  value,
  label: actionLabel(value),
}));
