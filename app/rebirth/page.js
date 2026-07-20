'use client';
import { useEffect, useState, useCallback } from 'react';
import AppShell from '../../components/AppShell';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthProvider';
import { usePlayerState } from '../../lib/usePlayerState';
import { fmt } from '../../lib/gameData';

export default function RebirthPage() {
  const { user } = useAuth();
  const { state: playerState, reload: reloadPlayerState } = usePlayerState();
  const [tiers, setTiers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('rebirths').select('*').order('level');
    setTiers(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  function flashToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3600); }

  const currentLevel = playerState?.rebirth_level || 0;
  const currentMultiplier = 1 + tiers.filter((t) => t.level <= currentLevel).reduce((s, t) => s + Number(t.multiplier_bonus), 0);
  const nextTier = tiers.find((t) => t.level === currentLevel + 1);
  const coins = playerState?.coins || 0;
  const eligible = nextTier && coins >= nextTier.coin_requirement;
  const progressPct = nextTier ? Math.min(100, (coins / nextTier.coin_requirement) * 100) : 100;

  async function doRebirth() {
    if (!nextTier) return;
    if (!confirm(`Rebirth now? Your coins will reset to 500, but your cards, upgrades, and gems stay forever. You'll permanently gain +${Math.round(nextTier.multiplier_bonus * 100)}% income and unlock anything gated behind Rebirth ${nextTier.level}.`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('perform_rebirth');
    setBusy(false);
    if (error) { flashToast('Could not rebirth: ' + error.message); return; }
    flashToast(`🌟 Reborn! Welcome to Rebirth ${data.new_level}: ${data.name}`);
    reloadPlayerState();
  }

  return (
    <AppShell coins={playerState?.coins} gems={playerState?.gems}>
      <div className="panel">
        <h2>Rebirth</h2>
        <p className="sub">Cash in your coins for a permanent income boost. Your card collection, upgrades, and gems are never touched — only coins reset.</p>
        <div className="stats-grid">
          <div className="stat"><div className="label">Current Rebirth</div><div className="value rose">{currentLevel}</div></div>
          <div className="stat"><div className="label">Permanent Multiplier</div><div className="value gold mono">x{currentMultiplier.toFixed(2)}</div></div>
          <div className="stat"><div className="label">Coins on Hand</div><div className="value gold mono">{fmt(coins)}</div></div>
        </div>

        {nextTier ? (
          <div className="upgrade-card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>Rebirth {nextTier.level}: {nextTier.name}</h3>
              <span className="lvl">+{Math.round(nextTier.multiplier_bonus * 100)}% income</span>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>{nextTier.description}</p>
            <div className="upgrade-bar"><div style={{ width: progressPct + '%' }} /></div>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
              <span className="muted mono">{fmt(coins)} / {fmt(nextTier.coin_requirement)} coins</span>
              <span className="muted mono">💎+{nextTier.gem_reward}</span>
            </div>
            <button className="btn full" disabled={!eligible || busy} onClick={doRebirth}>
              {busy ? 'Rebirthing…' : eligible ? '🌟 Rebirth Now' : `Need ${fmt(nextTier.coin_requirement - coins)} more coins`}
            </button>
          </div>
        ) : (
          <div className="empty">
            <div className="big">🏆</div>
            {tiers.length === 0 ? 'No rebirth tiers configured yet.' : "You've reached the top of the current rebirth ladder!"}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Rebirth Ladder</h2>
        <table className="admtable">
          <thead><tr><th>Tier</th><th>Requirement</th><th>Bonus</th><th>Status</th></tr></thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.level}>
                <td>{t.name}</td>
                <td className="mono">{fmt(t.coin_requirement)} coins</td>
                <td className="mono">+{Math.round(t.multiplier_bonus * 100)}% · 💎{t.gem_reward}</td>
                <td>{t.level <= currentLevel ? '✅ Reached' : t.level === currentLevel + 1 ? '🎯 Next' : '🔒 Locked'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </AppShell>
  );
}
