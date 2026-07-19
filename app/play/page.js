'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import AppShell from '../../components/AppShell';
import DailyQuests from '../../components/DailyQuests';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthProvider';
import { usePlayerState } from '../../lib/usePlayerState';
import { RARITIES, RARITY_MAP, fmt, estimatePending } from '../../lib/gameData';

export default function PlayPage() {
  const { user } = useAuth();
  const { state: playerState, reload: reloadPlayerState } = usePlayerState();

  const [series, setSeries] = useState([]);
  const [cards, setCards] = useState([]);
  const [ownedMap, setOwnedMap] = useState({}); // card_id -> {count, last_tick, total_generated}
  const [upgrades, setUpgrades] = useState([]);
  const [playerUpgrades, setPlayerUpgrades] = useState({}); // upgrade_id -> level
  const [filterSeries, setFilterSeries] = useState('');
  const [filterRarity, setFilterRarity] = useState('');
  const [tick, setTick] = useState(0);
  const [busyCard, setBusyCard] = useState(null);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState('');

  const loadAll = useCallback(async () => {
    if (!user) return;
    const [{ data: seriesData }, { data: cardsData }, { data: ownedData }, { data: upgradesData }, { data: playerUpgData }] =
      await Promise.all([
        supabase.from('series').select('*').order('sort_order'),
        supabase.from('cards').select('*'),
        supabase.from('player_cards').select('*').eq('user_id', user.id),
        supabase.from('upgrades').select('*'),
        supabase.from('player_upgrades').select('*').eq('user_id', user.id),
      ]);
    setSeries(seriesData || []);
    setCards(cardsData || []);
    setUpgrades(upgradesData || []);
    const om = {};
    (ownedData || []).forEach((r) => { om[r.card_id] = r; });
    setOwnedMap(om);
    const pu = {};
    (playerUpgData || []).forEach((r) => { pu[r.upgrade_id] = r.level; });
    setPlayerUpgrades(pu);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // live-updating "pending" ticker + periodic auto-collect
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const autoCollectLevel = playerUpgrades['auto_collect'] || 0;
  useEffect(() => {
    if (!autoCollectLevel) return;
    // higher level = shorter interval between automatic collects
    const seconds = Math.max(5, 30 - autoCollectLevel * 5);
    const id = setInterval(() => { collectAll(true); }, seconds * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCollectLevel]);

  const multiplier = useMemo(() => {
    let m = 1;
    upgrades.filter((u) => u.category === 'multiplier').forEach((u) => {
      m += (playerUpgrades[u.id] || 0) * Number(u.effect_value);
    });
    return m;
  }, [upgrades, playerUpgrades]);

  const capacityBonus = useMemo(() => {
    let c = 0;
    upgrades.filter((u) => u.category === 'capacity').forEach((u) => {
      c += (playerUpgrades[u.id] || 0) * Number(u.effect_value);
    });
    return c;
  }, [upgrades, playerUpgrades]);

  async function collectCard(cardId) {
    setBusyCard(cardId);
    const { data, error } = await supabase.rpc('collect_card', { p_card_id: cardId });
    setBusyCard(null);
    if (error) { flashToast('Could not collect: ' + error.message); return; }
    const amount = Number(data) || 0;
    if (amount > 0) flashToast(`+${fmt(amount)} coins collected`);
    setOwnedMap((prev) => ({
      ...prev,
      [cardId]: { ...prev[cardId], last_tick: new Date().toISOString(), total_generated: (prev[cardId]?.total_generated || 0) + amount },
    }));
    reloadPlayerState();
    supabase.rpc('check_achievements');
  }

  async function collectAll(silent) {
    const { data, error } = await supabase.rpc('collect_all');
    if (error) { if (!silent) flashToast('Could not collect: ' + error.message); return; }
    const amount = Number(data) || 0;
    if (amount > 0 && !silent) flashToast(`+${fmt(amount)} coins collected from your whole binder`);
    loadAll();
    reloadPlayerState();
    supabase.rpc('check_achievements');
  }

  function flashToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3200); }

  const totalPending = useMemo(() => {
    void tick;
    return cards.reduce((sum, c) => {
      const owned = ownedMap[c.id];
      if (!owned || owned.count <= 0) return sum;
      return sum + estimatePending({
        earnRate: c.earn_rate, count: owned.count, lastTick: owned.last_tick,
        capHours: c.cap_hours, capacityBonusHours: capacityBonus, multiplier,
      });
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, ownedMap, capacityBonus, multiplier, tick]);

  const uniqueOwned = Object.values(ownedMap).filter((r) => r.count > 0).length;

  return (
    <AppShell coins={playerState?.coins} gems={playerState?.gems}>
      <div className="stats-grid">
        <div className="stat"><div className="label">Unique Collected</div><div className="value">{uniqueOwned} / {cards.length}</div></div>
        <div className="stat"><div className="label">Uncollected Right Now</div><div className="value gold mono">{fmt(totalPending)}</div></div>
        <div className="stat"><div className="label">Income Multiplier</div><div className="value rose mono">x{multiplier.toFixed(2)}</div></div>
        <div className="stat">
          <button className="btn full" onClick={() => collectAll(false)}>Collect All</button>
        </div>
      </div>

      <DailyQuests onReward={(r) => {
        reloadPlayerState();
        flashToast(`Quest complete! +${fmt(r.coin_reward)} coins, +${fmt(r.gem_reward)} gems`);
      }} />

      <div className="panel">
        <h2>Your Binder</h2>
        <p className="sub">Tap a card to bank the coins it's generated. Duplicates and upgrades boost how fast each one fills up.</p>
        <div className="filters">
          <select value={filterSeries} onChange={(e) => setFilterSeries(e.target.value)}>
            <option value="">All series</option>
            {series.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
          </select>
          <select value={filterRarity} onChange={(e) => setFilterRarity(e.target.value)}>
            <option value="">All rarities</option>
            {RARITIES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        {series.filter((s) => !filterSeries || s.id === filterSeries).map((s) => {
          let seriesCards = cards.filter((c) => c.series_id === s.id);
          if (filterRarity) seriesCards = seriesCards.filter((c) => c.rarity === filterRarity);
          if (seriesCards.length === 0) return null;
          const owned = seriesCards.filter((c) => (ownedMap[c.id]?.count || 0) > 0).length;
          const pct = Math.round((owned / seriesCards.length) * 100);
          return (
            <div className="series-block" key={s.id}>
              <div className="series-head">
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <strong>{s.name}</strong>
                <div className="bar"><div style={{ width: pct + '%', background: s.accent }} /></div>
                <span className="pct">{owned}/{seriesCards.length}</span>
              </div>
              <div className="card-grid">
                {seriesCards.map((c) => {
                  const owned = ownedMap[c.id];
                  const count = owned?.count || 0;
                  const rr = RARITY_MAP[c.rarity];
                  const pending = count > 0 ? estimatePending({
                    earnRate: c.earn_rate, count, lastTick: owned.last_tick,
                    capHours: c.cap_hours, capacityBonusHours: capacityBonus, multiplier,
                  }) : 0;
                  return (
                    <div key={c.id} className={`gcard ${count === 0 ? 'locked' : ''}`} style={{ '--rc': rr.hex }}
                      onClick={() => count > 0 ? setDetail(c) : null}>
                      {pending > 0.5 && <span className="collect-hint">+{fmt(pending)}</span>}
                      <div className="art">{c.image_url ? <img src={c.image_url} alt="" /> : (count === 0 ? '❔' : s.icon)}</div>
                      <div className="foot">
                        <div className="name">{count === 0 ? '???' : c.name}</div>
                        <div className="meta">
                          <span className="rtag">{rr.name}</span>
                          {count > 0 && <span className="count">x{count}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {detail && (
        <CardDetailModal
          card={detail} owned={ownedMap[detail.id]} seriesIcon={series.find((s) => s.id === detail.series_id)?.icon}
          capacityBonus={capacityBonus} multiplier={multiplier} busy={busyCard === detail.id}
          onCollect={() => collectCard(detail.id)}
          onClose={() => setDetail(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </AppShell>
  );
}

function CardDetailModal({ card, owned, seriesIcon, capacityBonus, multiplier, busy, onCollect, onClose }) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id); }, []);
  const rr = RARITY_MAP[card.rarity];
  const count = owned?.count || 0;
  const pending = count > 0 ? estimatePending({
    earnRate: card.earn_rate, count, lastTick: owned.last_tick,
    capHours: card.cap_hours, capacityBonusHours: capacityBonus, multiplier,
  }) : 0;
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }}>
        <div style={{ width: 160, height: 220, margin: '0 auto 14px', borderRadius: 14, overflow: 'hidden', border: `2px solid ${rr.hex}`, boxShadow: `0 0 28px ${rr.hex}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(160deg, ${rr.hex}33, var(--surface-2))`, fontSize: 44 }}>
          {card.image_url ? <img src={card.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : seriesIcon}
        </div>
        <h2>{card.name}</h2>
        <p className="sub" style={{ color: rr.hex, fontWeight: 700 }}>{rr.name}</p>
        {card.flavor && <p className="muted">{card.flavor}</p>}
        <div className="stats-grid" style={{ marginTop: 14 }}>
          <div className="stat"><div className="label">Owned</div><div className="value">{count}</div></div>
          <div className="stat"><div className="label">Lifetime Earned</div><div className="value gold mono">{fmt(owned?.total_generated || 0)}</div></div>
        </div>
        <div className="stat" style={{ marginTop: 12 }}>
          <div className="label">Ready to Collect</div>
          <div className="value gold mono">{fmt(pending)}</div>
        </div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn" onClick={onCollect} disabled={busy || pending < 1}>{busy ? 'Collecting…' : 'Collect'}</button>
        </div>
      </div>
    </div>
  );
}
