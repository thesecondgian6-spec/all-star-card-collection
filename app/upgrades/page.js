'use client';
import { useEffect, useState, useCallback } from 'react';
import AppShell from '../../components/AppShell';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthProvider';
import { usePlayerState } from '../../lib/usePlayerState';
import { fmt, upgradeCost } from '../../lib/gameData';

const CATEGORY_INFO = {
  auto_collect: { icon: '🤖', blurb: 'Automatically collects income from every card on a timer — set it and forget it.' },
  multiplier:   { icon: '📈', blurb: 'Boosts every card\'s income generation, permanently.' },
  capacity:     { icon: '🗄️', blurb: 'Increases how long cards can store income before they cap out.' },
  luck:         { icon: '🍀', blurb: 'Improves your odds of pulling rare-and-above cards from packs.' },
  offline:      { icon: '🌙', blurb: 'Improves earnings while you\'re away.' },
  multi_spin:   { icon: '🎰', blurb: 'Lets you queue multiple pack spins per button press (still pays full cost per spin).' },
};

export default function UpgradesPage() {
  const { user } = useAuth();
  const { state: playerState, reload: reloadPlayerState } = usePlayerState();
  const [upgrades, setUpgrades] = useState([]);
  const [levels, setLevels] = useState({});
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: u }, { data: pu }] = await Promise.all([
      supabase.from('upgrades').select('*').order('sort_order'),
      supabase.from('player_upgrades').select('*').eq('user_id', user.id),
    ]);
    setUpgrades(u || []);
    const lv = {};
    (pu || []).forEach((r) => { lv[r.upgrade_id] = r.level; });
    setLevels(lv);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  function flashToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3200); }

  async function buy(upgrade) {
    setBusy(upgrade.id);
    const { data, error } = await supabase.rpc('purchase_upgrade', { p_upgrade_id: upgrade.id });
    setBusy(null);
    if (error) {
      const msg = error.message.includes('insufficient') ? `Not enough ${upgrade.currency} for that yet.`
        : error.message.includes('locked') ? `Requires Rebirth ${upgrade.required_rebirth} to unlock.`
        : 'Could not purchase: ' + error.message;
      flashToast(msg);
      return;
    }
    flashToast(`${upgrade.name} leveled up to ${data.new_level}!`);
    load();
    reloadPlayerState();
  }

  function UpgradeCard({ u }) {
    const level = levels[u.id] || 0;
    const maxed = level >= u.max_level;
    const cost = maxed ? null : upgradeCost(u, level);
    const rebirthLevel = playerState?.rebirth_level || 0;
    const locked = u.required_rebirth > rebirthLevel;
    const balance = u.currency === 'coins' ? (playerState?.coins || 0) : (playerState?.gems || 0);
    const affordable = !locked && cost !== null && balance >= cost;
    const info = CATEGORY_INFO[u.category] || {};
    const icon = u.currency === 'coins' ? '🪙' : '💎';
    return (
      <div className="upgrade-card" style={{ opacity: locked ? 0.55 : 1 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: 26 }}>{locked ? '🔒' : info.icon}</span>
          <span className="lvl">Lv. {level}/{u.max_level}</span>
        </div>
        <h3>{u.name}</h3>
        <p className="muted" style={{ fontSize: 12.5 }}>{locked ? `Requires Rebirth ${u.required_rebirth} to unlock.` : (u.description || info.blurb)}</p>
        <div className="upgrade-bar"><div style={{ width: `${(level / u.max_level) * 100}%` }} /></div>
        {locked ? (
          <button className="btn ghost full" disabled>🔒 Requires Rebirth {u.required_rebirth}</button>
        ) : maxed ? (
          <button className="btn ghost full" disabled>Max Level</button>
        ) : (
          <button className="btn full" disabled={!affordable || busy === u.id} onClick={() => buy(u)}>
            {busy === u.id ? 'Purchasing…' : `${icon} ${fmt(cost)} — Upgrade`}
          </button>
        )}
      </div>
    );
  }

  const gemUpgrades = upgrades.filter((u) => u.currency === 'gems');
  const coinUpgrades = upgrades.filter((u) => u.currency === 'coins');

  return (
    <AppShell coins={playerState?.coins} gems={playerState?.gems}>
      <div className="panel">
        <h2>💎 Utility Upgrades</h2>
        <p className="sub">Auto-collect, multi-spin, storage, and luck — paid for with gems, which you earn slowly from achievements and daily logins.</p>
        <div className="pack-grid">
          {gemUpgrades.map((u) => <UpgradeCard u={u} key={u.id} />)}
          {gemUpgrades.length === 0 && <div className="empty">No utility upgrades configured yet.</div>}
        </div>
      </div>

      <div className="panel">
        <h2>🪙 Income Upgrades</h2>
        <p className="sub">Multipliers — paid for with coins, so growing them competes directly with saving up for packs and rebirths.</p>
        <div className="pack-grid">
          {coinUpgrades.map((u) => <UpgradeCard u={u} key={u.id} />)}
          {coinUpgrades.length === 0 && <div className="empty">No income upgrades configured yet.</div>}
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </AppShell>
  );
}
