'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import AppShell from '../../components/AppShell';
import DailyQuests from '../../components/DailyQuests';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthProvider';
import { usePlayerState } from '../../lib/usePlayerState';
import { RARITIES, RARITY_MAP, fmt } from '../../lib/gameData';
import { playFlip, celebrateRarity, isSoundEnabled, setSoundEnabled } from '../../lib/effects';

export default function PacksPage() {
  const { user } = useAuth();
  const { state: playerState, reload: reloadPlayerState } = usePlayerState();
  const [packs, setPacks] = useState([]);
  const [series, setSeries] = useState([]);
  const [reveal, setReveal] = useState(null); // array of pulled cards
  const [revealedCount, setRevealedCount] = useState(0);
  const [opening, setOpening] = useState(null);
  const [history, setHistory] = useState([]);
  const [toast, setToast] = useState('');
  const [soundOn, setSoundOn] = useState(true);
  const [playerUpgrades, setPlayerUpgrades] = useState({});
  const [upgrades, setUpgrades] = useState([]);
  const [spinCount, setSpinCount] = useState(1);

  useEffect(() => { setSoundOn(isSoundEnabled()); }, []);
  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  }

  const bestRarity = (results) => {
    const order = RARITIES.map((r) => r.id);
    return results.reduce((best, r) => (order.indexOf(r.rarity) > order.indexOf(best) ? r.rarity : best), 'common');
  };

  const load = useCallback(async () => {
    const [{ data: packData }, { data: seriesData }, { data: histData }, { data: upgData }, { data: pUpgData }] = await Promise.all([
      supabase.from('packs').select('*'),
      supabase.from('series').select('*'),
      user ? supabase.from('pull_history').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10) : { data: [] },
      supabase.from('upgrades').select('*'),
      user ? supabase.from('player_upgrades').select('*').eq('user_id', user.id) : { data: [] },
    ]);
    setPacks(packData || []);
    setSeries(seriesData || []);
    setHistory(histData || []);
    setUpgrades(upgData || []);
    const pu = {};
    (pUpgData || []).forEach((r) => { pu[r.upgrade_id] = r.level; });
    setPlayerUpgrades(pu);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const maxSpins = useMemo(() => {
    const multiSpinUpgrade = upgrades.find((u) => u.category === 'multi_spin');
    const level = multiSpinUpgrade ? (playerUpgrades[multiSpinUpgrade.id] || 0) : 0;
    return 1 + level;
  }, [upgrades, playerUpgrades]);

  useEffect(() => { if (spinCount > maxSpins) setSpinCount(maxSpins); }, [maxSpins, spinCount]);

  const [pulseClass, setPulseClass] = useState('');

  useEffect(() => {
    if (reveal && reveal.length > 0 && revealedCount >= reveal.length) {
      const rarity = bestRarity(reveal);
      celebrateRarity(rarity);
      if (rarity === 'legendary' || rarity === 'mythic') {
        setPulseClass('pulse-' + rarity);
        setTimeout(() => setPulseClass(''), 3000);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedCount, reveal]);

  const rebirthLevel = playerState?.rebirth_level || 0;

  async function open(pack) {
    if (pack.required_rebirth > rebirthLevel) { flashToast(`Locked — requires Rebirth ${pack.required_rebirth}.`); return; }
    const totalCost = pack.cost * spinCount;
    if ((playerState?.coins || 0) < totalCost) { flashToast("You don't have enough coins for that many spins yet."); return; }
    setOpening(pack.id);
    const { data, error } = await supabase.rpc('open_pack', { p_pack_id: pack.id, p_spin_count: spinCount });
    setOpening(null);
    if (error) { flashToast('Could not open pack: ' + error.message); return; }
    setReveal(data || []);
    setRevealedCount(0);
    reloadPlayerState();
    load();
    supabase.rpc('check_achievements');
    const results = data || [];
    results.forEach((_, i) => setTimeout(() => { setRevealedCount((c) => c + 1); playFlip(); }, 260 * i + 200));
  }

  function flashToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3200); }

  return (
    <AppShell coins={playerState?.coins} gems={playerState?.gems}>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2>Open Packs</h2>
            <p className="sub">Each spin gives exactly 1 card. Unlock Multi-Spin in Upgrades to queue more at once.</p>
          </div>
          <button className={`sound-toggle ${soundOn ? '' : 'off'}`} onClick={toggleSound} title={soundOn ? 'Mute sound' : 'Unmute sound'}>
            {soundOn ? '🔊' : '🔇'}
          </button>
        </div>

        {typeof playerState?.pity_counter === 'number' && (
          <div style={{ marginBottom: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="muted" style={{ fontSize: 12 }}>🍀 Pity meter — guaranteed rare+ pull</span>
              <span className="muted mono" style={{ fontSize: 12 }}>{Math.min(playerState.pity_counter, 20)}/20</span>
            </div>
            <div className="upgrade-bar"><div style={{ width: `${Math.min(100, (playerState.pity_counter / 20) * 100)}%` }} /></div>
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Spins per press {maxSpins === 1 && '(unlock Multi-Spin in Upgrades for more)'}</div>
          <div className="row">
            {Array.from({ length: maxSpins }, (_, i) => i + 1).map((n) => (
              <button key={n} className={`btn small ${spinCount === n ? '' : 'ghost'}`} onClick={() => setSpinCount(n)}>x{n}</button>
            ))}
          </div>
        </div>

        <div className="pack-grid">
          {packs.map((pack) => {
            const s = pack.series_filter ? series.find((x) => x.id === pack.series_filter) : null;
            const totalCost = pack.cost * spinCount;
            const locked = pack.required_rebirth > rebirthLevel;
            const affordable = !locked && (playerState?.coins || 0) >= totalCost;
            return (
              <div className="pack-card" key={pack.id} style={{ '--pack-accent': pack.accent, opacity: locked ? 0.55 : 1 }}>
                <div className="icon">{locked ? '🔒' : pack.icon}</div>
                <h3>{pack.name}</h3>
                <div className="desc">
                  {locked ? `Requires Rebirth ${pack.required_rebirth}` : (s ? `${s.name} only` : 'All series')} · 1 card per spin
                </div>
                <div className="odds">
                  {RARITIES.filter((r) => Number(pack.weights[r.id]) > 0).map((r) => (
                    <span className="chip" key={r.id} style={{ color: r.hex, borderColor: r.hex + '55' }}>{r.name}</span>
                  ))}
                </div>
                <div className="cost-row">
                  <span className="cost mono">🪙 {fmt(totalCost)}{spinCount > 1 ? ` (x${spinCount})` : ''}</span>
                  <button className="btn" disabled={!affordable || opening === pack.id} onClick={() => open(pack)}>
                    {locked ? 'Locked' : opening === pack.id ? 'Spinning…' : `Spin${spinCount > 1 ? ' x' + spinCount : ''}`}
                  </button>
                </div>
              </div>
            );
          })}
          {packs.length === 0 && <div className="empty">No packs available yet.</div>}
        </div>
      </div>

      <DailyQuests onReward={(r) => {
        reloadPlayerState();
        flashToast(`Quest complete! +${fmt(r.coin_reward)} coins, +${fmt(r.gem_reward)} gems`);
      }} />

      <div className="panel">
        <h2>Recent Pulls</h2>
        {history.length === 0 ? <p className="muted">Open a pack to see your pull history here.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h) => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <span className="muted">{h.pack_id}</span>
                <span style={{ color: RARITY_MAP[h.rarity].hex }}>{h.card_id}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {reveal && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) { setReveal(null); } }}>
          <div className={`modal ${pulseClass}`}>
            <h2>Spin Results</h2>
            <p className="sub">Tap anywhere to reveal faster.</p>
            <div className="reveal-stage" onClick={() => setRevealedCount(reveal.length)}>
              {reveal.map((r, i) => {
                const rr = RARITY_MAP[r.rarity];
                const s = series.find((x) => x.id === r.series_id);
                return (
                  <div key={i} className={`flipcard ${i < revealedCount ? 'up' : ''}`} style={{ '--rc': rr.hex, '--rc-glow': rr.hex + '88' }}>
                    <div className="inner">
                      <div className="face back">{s?.icon || '🎴'}</div>
                      <div className="face front">
                        {r.is_new && <div className="newbadge">NEW</div>}
                        {r.is_pity && <div className="newbadge" style={{ top: r.is_new ? 24 : 4, background: 'var(--gold)', color: '#160f22' }}>🍀 PITY</div>}
                        <div className="art">{r.image_url ? <img src={r.image_url} alt="" /> : (s?.icon || '🎴')}</div>
                        <div className="foot"><div className="name">{r.name}</div><div className="rtag">{rr.name}</div></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setReveal(null)}>Continue</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </AppShell>
  );
}
