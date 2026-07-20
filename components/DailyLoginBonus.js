'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthProvider';
import { fmt } from '../lib/gameData';

// Module-scope guard so this only fires once per page load, even though AppShell
// (and therefore this component) remounts on every route change in the App Router.
let calledThisSession = false;

export default function DailyLoginBonus({ onClaimed }) {
  const { user } = useAuth();
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!user || calledThisSession) return;
    calledThisSession = true;
    supabase.rpc('daily_login').then(({ data, error }) => {
      if (error || !data || data.already_claimed) return;
      setResult(data);
      onClaimed?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!result) return null;

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setResult(null)}>
      <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 4 }}>🎁</div>
        <h2>Daily Login Bonus</h2>
        <p className="sub" style={{ color: 'var(--gold)', fontWeight: 700 }}>
          {result.streak} day streak{result.streak > 1 ? '!' : ''}
        </p>
        <div className="stats-grid" style={{ marginTop: 6 }}>
          <div className="stat"><div className="label">Coins</div><div className="value gold mono">+{fmt(result.bonus_coins)}</div></div>
          <div className="stat"><div className="label">Gems</div><div className="value rose mono">+{fmt(result.bonus_gems)}</div></div>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>Come back tomorrow to keep your streak alive — rewards grow the longer it lasts.</p>
        <button className="btn full" style={{ marginTop: 14 }} onClick={() => setResult(null)}>Nice!</button>
      </div>
    </div>
  );
}
