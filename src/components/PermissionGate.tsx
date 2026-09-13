import type { ReactNode } from 'react';
import { can, type AuthUser, type PermissionKey } from '@/lib/auth/rbac';

export function PermissionGate({
  permiso,
  user,
  children,
}: {
  permiso: PermissionKey;
  user: AuthUser | null;
  children: ReactNode;
}) {
  return can(user, permiso) ? <>{children}</> : null;
}
