import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/context';
import { ChangePasswordForm } from './ChangePasswordForm';

export const dynamic = 'force-dynamic';

export default async function CambiarPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return <ChangePasswordForm forced={user.mustChangePassword} />;
}
