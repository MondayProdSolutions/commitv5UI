import { notFound } from 'next/navigation';
import { isBootstrapNeeded } from '@/lib/auth/bootstrap';
import { SetupForm } from './SetupForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (!(await isBootstrapNeeded())) notFound();
  return <SetupForm />;
}
