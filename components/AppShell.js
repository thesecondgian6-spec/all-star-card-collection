'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../lib/AuthProvider';
import { fmt } from '../lib/gameData';
import { useCountUp } from '../lib/useCountUp';
import DailyLoginBonus from './DailyLoginBonus';

export default function AppShell({ children, coins, gems }) {
  const { loading, user, profile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const displayCoins = useCountUp(coins ?? 0);
  const displayGems = useCountUp(gems ?? 0);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);

  if (loading || !user) {
    return <div className="center-screen"><div className="muted">Loading…</div></div>;
  }

  const tabs = [
    { href: '/play', label: 'Binder', icon: '🗂️' },
    { href: '/packs', label: 'Packs', icon: '📦' },
    { href: '/upgrades', label: 'Upgrades', icon: '⚡' },
    { href: '/rebirth', label: 'Rebirth', icon: '🌟' },
    { href: '/profile', label: 'Profile', icon: '👤' },
  ];
  if (profile?.is_admin) tabs.push({ href: '/admin', label: 'Admin', icon: '🛠️' });

  return (
    <div id="shell">
      <header className="topbar">
        <Link href="/play" className="brand">
          <div className="brand-mark">🎴</div>
          <div><h1>All Star Card Collection</h1><span>Roll · Collect · Flex</span></div>
        </Link>
        <div className="wallets">
          <div className="wallet-item coins"><span>🪙</span><span className="num">{fmt(displayCoins)}</span></div>
          <div className="wallet-item gems"><span>💎</span><span className="num">{fmt(displayGems)}</span></div>
        </div>
      </header>
      <nav className="tabs">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={pathname === t.href ? 'active' : ''}>{t.icon} {t.label}</Link>
        ))}
      </nav>
      <div className="page-fade" key={pathname}>{children}</div>
      <DailyLoginBonus />

      <nav className="bottom-nav">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={pathname === t.href ? 'active' : ''}>
            <span className="bn-icon">{t.icon}</span>
            <span className="bn-label">{t.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
