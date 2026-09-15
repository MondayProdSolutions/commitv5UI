import { Card } from '@/components/ui/Card';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default function PlatformLoginPage() {
  return (
    <main className="mx-auto mt-16 w-full max-w-sm px-4">
      <p className="mb-6 text-center text-2xl font-extrabold tracking-tight text-ink">Plataforma</p>
      <Card>
        <LoginForm />
      </Card>
    </main>
  );
}
