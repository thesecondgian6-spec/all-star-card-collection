'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../lib/AuthProvider';
import { fmt } from '../lib/gameData';

export default function AppShell({ children, coins, gems }) {
  const { loading, user, profile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);

  if (loading || !user) {
    return <div className="center-screen"><div className="muted">Loading…</div></div>;
  }

  const tabs = [
    { href: '/play', label: '🗂️ Binder' },
    { href: '/packs', label: '📦 Packs' },
    { href: '/upgrades', label: '⚡ Upgrades' },
    { href: '/profile', label: '👤 Profile' },
  ];
  if (profile?.is_admin) tabs.push({ href: '/admin', label: '🛠️ Admin' });

  return (
    <div id="shell">
      <header className="topbar">
        <Link href="/play" className="brand">
          <div className="brand-mark">🎴</div>
          <div><h1>All Star Card Collection</h1><span>Roll · Collect · Flex</span></div>
        </Link>
        <div className="wallets">
          <div className="wallet-item coins"><span>🪙</span><span className="num">{fmt(coins ?? 0)}</span></div>
          <div className="wallet-item gems"><span>💎</span><span className="num">{fmt(gems ?? 0)}</span></div>
        </div>
      </header>
      <nav className="tabs">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={pathname === t.href ? 'active' : ''}>{t.label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
