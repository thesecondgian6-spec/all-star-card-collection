'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import AppShell from '../../components/AppShell';
import DailyQuests from '../../components/DailyQuests';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthProvider';
import { usePlayerState } from '../../lib/usePlayerState';
import { RARITIES, RARITY_MAP, fmt, estimatePending } from '../../lib/gameData';
import { flyCoinToWallet } from '../../lib/effects';

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
  const [rebirths, setRebirths] = useState([]);
  const [toast, setToast] = useState('');

  const loadAll = useCallback(async () => {
    if (!user) return;
    const [{ data: seriesData }, { data: cardsData }, { data: ownedData }, { data: upgradesData }, { data: playerUpgData }, { data: rebirthData }] =
      await Promise.all([
        supabase.from('series').select('*').order('sort_order'),
        supabase.from('cards').select('*'),
        supabase.from('player_cards').select('*').eq('user_id', user.id),
        supabase.from('upgrades').select('*'),
        supabase.from('player_upgrades').select('*').eq('user_id', user.id),
        supabase.from('rebirths').select('*'),
      ]);
    setSeries(seriesData || []);
    setCards(cardsData || []);
    setUpgrades(upgradesData || []);
    setRebirths(rebirthData || []);
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
    const rebirthLevel = playerState?.rebirth_level || 0;
    const rebirthBonus = rebirths.filter((r) => r.level <= rebirthLevel).reduce((s, r) => s + Number(r.multiplier_bonus), 0);
    return m * (1 + rebirthBonus);
  }, [upgrades, playerUpgrades, rebirths, playerState?.rebirth_level]);

  const capacityBonus = useMemo(() => {
    let c = 0;
    upgrades.filter((u) => u.category === 'capacity').forEach((u) => {
      c += (playerUpgrades[u.id] || 0) * Number(u.effect_value);
    });
    return c;
  }, [upgrades, playerUpgrades]);

  async function collectCard(cardId, originEl) {
    setBusyCard(cardId);
    const { data, error } = await supabase.rpc('collect_card', { p_card_id: cardId });
    setBusyCard(null);
    if (error) { flashToast('Could not collect: ' + error.message); return; }
    const amount = Number(data) || 0;
    if (amount > 0) {
      flashToast(`+${fmt(amount)} coins collected`);
      flyCoinToWallet(originEl);
    }
    setOwnedMap((prev) => ({
      ...prev,
      [cardId]: { ...prev[cardId], last_tick: new Date().toISOString(), total_generated: (prev[cardId]?.total_generated || 0) + amount },
    }));
    reloadPlayerState();
    supabase.rpc('check_achievements');
  }

  async function collectAll(silent, originEl) {
    const { data, error } = await supabase.rpc('collect_all', { p_is_auto: !!silent });
    if (error) { if (!silent) flashToast('Could not collect: ' + error.message); return; }
    const amount = Number(data) || 0;
    if (amount > 0 && !silent) {
      flashToast(`+${fmt(amount)} coins collected from your whole binder`);
      flyCoinToWallet(originEl, 6);
    }
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

  const comboActive = playerState?.combo_count > 0 && playerState?.last_collect_at &&
    (Date.now() - new Date(playerState.last_collect_at).getTime()) < 90000;
  const comboSecondsLeft = comboActive ? Math.max(0, Math.ceil(90 - (Date.now() - new Date(playerState.last_collect_at).getTime()) / 1000)) : 0;
  const comboBonusPct = Math.min((playerState?.combo_count || 0) * 2, 50);

  return (
    <AppShell coins={playerState?.coins} gems={playerState?.gems}>
      <div className="stats-grid">
        <div className="stat"><div className="label">Unique Collected</div><div className="value">{uniqueOwned} / {cards.length}</div></div>
        <div className="stat"><div className="label">Uncollected Right Now</div><div className="value gold mono">{fmt(totalPending)}</div></div>
        <div className="stat"><div className="label">Income Multiplier</div><div className="value rose mono">x{multiplier.toFixed(2)}</div></div>
        <div className="stat">
          <div className="label">Collect Combo</div>
          {comboActive ? (
            <div className="value" style={{ color: 'var(--gold)' }}>🔥 x{playerState.combo_count} <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>(+{comboBonusPct}%, {comboSecondsLeft}s)</span></div>
          ) : (
            <div className="value" style={{ color: 'var(--text-faint)', fontSize: 15 }}>Collect to start a streak</div>
          )}
        </div>
        <div className="stat">
          <button className="btn full" onClick={(e) => collectAll(false, e.currentTarget)}>Collect All</button>
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
                    <div key={c.id} className={`gcard ${count === 0 ? 'locked' : ''} ${count > 0 && ['epic', 'legendary', 'mythic'].includes(c.rarity) ? 'shine' : ''}`} style={{ '--rc': rr.hex }}
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
          card={detail} owned={ownedMap[detail.id]} cardSeries={series.find((s) => s.id === detail.series_id)}
          capacityBonus={capacityBonus} multiplier={multiplier} busy={busyCard === detail.id}
          onCollect={(e) => collectCard(detail.id, e.currentTarget)}
          onClose={() => setDetail(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </AppShell>
  );
}

function CardDetailModal({ card, owned, cardSeries, capacityBonus, multiplier, busy, onCollect, onClose }) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id); }, []);
  const rr = RARITY_MAP[card.rarity];
  const count = owned?.count || 0;
  const pending = count > 0 ? estimatePending({
    earnRate: card.earn_rate, count, lastTick: owned.last_tick,
    capHours: card.cap_hours, capacityBonusHours: capacityBonus, multiplier,
  }) : 0;
  const effectiveRatePerSec = Number(card.earn_rate) * count * multiplier;

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card-profile-modal" style={{ '--rc': rr.hex }}>
        <div className="card-profile-banner">
          {card.image_url ? (
            <img src={card.image_url} alt="" />
          ) : (
            <div className="card-profile-banner-fallback">{cardSeries?.icon || '🎴'}</div>
          )}
          <button className="card-profile-close" onClick={onClose} aria-label="Close">✕</button>
          <div className="card-profile-banner-scrim" />
          <div className="card-profile-banner-content">
            <span className="rtag" style={{ color: rr.hex, background: `${rr.hex}22`, border: `1px solid ${rr.hex}55` }}>{rr.name}</span>
            <h2>{card.name}</h2>
            {cardSeries && <span className="card-profile-series">{cardSeries.icon} {cardSeries.name}</span>}
          </div>
        </div>

        <div style={{ padding: '16px 20px 20px' }}>
          {card.flavor && (
            <blockquote className="card-lore">{card.flavor}</blockquote>
          )}

          <div className="stats-grid">
            <div className="stat"><div className="label">Owned</div><div className="value">{count}</div></div>
            <div className="stat"><div className="label">Base Rate</div><div className="value mono" style={{ fontSize: 16 }}>{card.earn_rate}/s</div></div>
            <div className="stat"><div className="label">Current Output</div><div className="value gold mono" style={{ fontSize: 16 }}>{fmt(effectiveRatePerSec)}/s</div></div>
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
    </div>
  );
}
