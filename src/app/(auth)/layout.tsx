import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto mt-16 w-full max-w-sm px-4">
      <p className="mb-6 text-center text-2xl font-extrabold tracking-tight text-ink">POS</p>
      <Card>{children}</Card>
    </main>
  );
}
