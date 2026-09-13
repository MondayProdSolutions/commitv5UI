import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/context';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { InactivityWatcher } from '@/components/InactivityWatcher';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const idle = await getIdleTimeoutMinutes();
  const pathname = (await headers()).get('x-pathname') ?? '';
  // En la pantalla del cajero el sidebar se colapsa a un riel de 76px.
  const railMode = pathname === '/ventas';

  return (
    <div
      className={
        'grid min-h-screen grid-cols-1 ' +
        (railMode ? 'md:grid-cols-[76px_1fr]' : 'md:grid-cols-[240px_1fr]')
      }
    >
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-col">
        <Topbar user={user} />
        <main className="flex-1 p-6">{children}</main>
      </div>
      <InactivityWatcher idleTimeoutMinutes={idle} />
    </div>
  );
}
