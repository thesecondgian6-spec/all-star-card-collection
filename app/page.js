'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/AuthProvider';

export default function RootPage() {
  const { loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/play' : '/login');
  }, [loading, user, router]);

  return (
    <div className="center-screen">
      <div className="muted">Loading All Star Card Collection…</div>
    </div>
  );
}
