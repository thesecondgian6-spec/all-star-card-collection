'use client';
import { useEffect, useState, useCallback } from 'react';
import AppShell from '../../components/AppShell';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthProvider';
import { usePlayerState } from '../../lib/usePlayerState';
import { RARITIES, RARITY_MAP, fmt, levelUpCost } from '../../lib/gameData';

const MAX_ROSTER = 10;

export default function CollectionPage() {
  const { user } = useAuth();
  const { state: playerState, reload: reloadPlayerState } = usePlayerState();
  const [series, setSeries] = useState([]);
  const [cards, setCards] = useState([]);
  const [ownedMap, setOwnedMap] = useState({});
  const [filterSeries, setFilterSeries] = useState('');
  const [filterRarity, setFilterRarity] = useState('');
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: seriesData }, { data: cardsData }, { data: ownedData }] = await Promise.all([
      supabase.from('series').select('*').order('sort_order'),
      supabase.from('cards').select('*'),
      supabase.from('player_cards').select('*').eq('user_id', user.id),
    ]);
    setSeries(seriesData || []);
    setCards(cardsData || []);
    const om = {};
    (ownedData || []).forEach((r) => { om[r.card_id] = r; });
    setOwnedMap(om);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  function flashToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3200); }

  const rosterCount = Object.values(ownedMap).filter((r) => r.is_displayed).length;

  async function toggleDisplay(cardId, displayed) {
    setBusy(true);
    const { error } = await supabase.rpc('set_card_display', { p_card_id: cardId, p_displayed: displayed });
    setBusy(false);
    if (error) { flashToast(displayed ? `Roster full — remove a card on your Binder first.` : 'Could not update roster.'); return; }
    load();
    flashToast(displayed ? 'Added to your active roster.' : 'Removed from your active roster.');
  }

  async function levelUp(cardId) {
    setBusy(true);
    const { data, error } = await supabase.rpc('level_up_card', { p_card_id: cardId });
    setBusy(false);
    if (error) {
      const msg = error.message.includes('duplicate') ? 'Not enough spare copies to level up yet.'
        : error.message.includes('insufficient') ? 'Not enough coins to level up yet.'
        : 'Could not level up: ' + error.message;
      flashToast(msg);
      return;
    }
    flashToast(`Leveled up to Lv. ${data.new_level}!`);
    load();
    reloadPlayerState();
  }

  const uniqueOwned = Object.values(ownedMap).filter((r) => r.count > 0).length;

  return (
    <AppShell coins={playerState?.coins} gems={playerState?.gems}>
      <div className="stats-grid">
        <div className="stat"><div className="label">Unique Collected</div><div className="value">{uniqueOwned} / {cards.length}</div></div>
        <div className="stat"><div className="label">Active Roster</div><div className="value rose">{rosterCount} / {MAX_ROSTER}</div></div>
      </div>

      <div className="panel">
        <h2>Collection</h2>
        <p className="sub">Every card you&apos;ve ever pulled lives here forever, even if it&apos;s not in your active roster. Tap an owned card to manage its level or add/remove it from your <a href="/play" style={{ color: 'var(--rose)', textDecoration: 'underline' }}>Binder</a>.</p>
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
                  return (
                    <div key={c.id} className={`gcard ${count === 0 ? 'locked' : ''} ${count > 0 && ['epic', 'legendary', 'mythic'].includes(c.rarity) ? 'shine' : ''}`} style={{ '--rc': rr.hex }}
                      onClick={() => count > 0 ? setDetail(c) : null}>
                      {owned?.is_displayed && <span className="collect-hint" style={{ background: 'rgba(157,92,255,0.9)' }}>⭐ Roster</span>}
                      {count > 0 && <span className="lvl-badge">Lv.{owned.level}</span>}
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
        <CollectionCardModal
          card={detail} owned={ownedMap[detail.id]} cardSeries={series.find((s) => s.id === detail.series_id)}
          rosterFull={rosterCount >= MAX_ROSTER} busy={busy} coins={playerState?.coins || 0}
          onToggleDisplay={(displayed) => toggleDisplay(detail.id, displayed)}
          onLevelUp={() => levelUp(detail.id)}
          onClose={() => setDetail(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </AppShell>
  );
}

function CollectionCardModal({ card, owned, cardSeries, rosterFull, busy, coins, onToggleDisplay, onLevelUp, onClose }) {
  const rr = RARITY_MAP[card.rarity];
  const count = owned?.count || 0;
  const level = owned?.level || 1;
  const isDisplayed = !!owned?.is_displayed;
  const { dupesNeeded, coinCost } = levelUpCost(card, level);
  const spareCopies = Math.max(0, count - 1);
  const canLevelUp = spareCopies >= dupesNeeded && coins >= coinCost;

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
          <span className="card-profile-level">Lv. {level}</span>
          <div className="card-profile-banner-content">
            <span className="rtag" style={{ color: rr.hex, background: `${rr.hex}22`, border: `1px solid ${rr.hex}55` }}>{rr.name}</span>
            <h2>{card.name}</h2>
            {cardSeries && <span className="card-profile-series">{cardSeries.icon} {cardSeries.name}</span>}
          </div>
        </div>

        <div style={{ padding: '16px 20px 20px' }}>
          {card.flavor && <blockquote className="card-lore">{card.flavor}</blockquote>}

          <div className="stats-grid">
            <div className="stat"><div className="label">Level</div><div className="value">{level}</div></div>
            <div className="stat"><div className="label">Owned</div><div className="value">{count} <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>({spareCopies} spare)</span></div></div>
            <div className="stat"><div className="label">Lifetime Earned</div><div className="value gold mono">{fmt(owned?.total_generated || 0)}</div></div>
            <div className="stat"><div className="label">Roster Status</div><div className="value" style={{ fontSize: 15, color: isDisplayed ? 'var(--rose)' : 'var(--text-faint)' }}>{isDisplayed ? '⭐ Active' : 'Not active'}</div></div>
          </div>

          <div className="level-up-box">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Level {level} → {level + 1}</span>
              <span className="muted mono" style={{ fontSize: 12 }}>{dupesNeeded} spare + 🪙{fmt(coinCost)}</span>
            </div>
            <button className="btn full" style={{ marginTop: 8 }} disabled={!canLevelUp || busy} onClick={onLevelUp}>
              {busy ? 'Leveling…' : canLevelUp ? 'Level Up' : `Need ${Math.max(0, dupesNeeded - spareCopies)} more copies`}
            </button>
          </div>

          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="btn ghost" onClick={onClose}>Close</button>
            {isDisplayed ? (
              <button className="btn" onClick={() => onToggleDisplay(false)} disabled={busy}>Remove from Roster</button>
            ) : (
              <button className="btn" onClick={() => onToggleDisplay(true)} disabled={busy || rosterFull} title={rosterFull ? 'Your roster is full' : ''}>
                {rosterFull ? 'Roster Full' : 'Add to Roster'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
