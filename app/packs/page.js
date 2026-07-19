'use client';
import { useEffect, useState, useCallback } from 'react';
import AppShell from '../../components/AppShell';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthProvider';
import { usePlayerState } from '../../lib/usePlayerState';
import { RARITIES, RARITY_MAP, fmt } from '../../lib/gameData';

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

  const load = useCallback(async () => {
    const [{ data: packData }, { data: seriesData }, { data: histData }] = await Promise.all([
      supabase.from('packs').select('*'),
      supabase.from('series').select('*'),
      user ? supabase.from('pull_history').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10) : { data: [] },
    ]);
    setPacks(packData || []);
    setSeries(seriesData || []);
    setHistory(histData || []);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function open(pack) {
    if ((playerState?.coins || 0) < pack.cost) { flashToast("You don't have enough coins for that pack yet."); return; }
    setOpening(pack.id);
    const { data, error } = await supabase.rpc('open_pack', { p_pack_id: pack.id });
    setOpening(null);
    if (error) { flashToast('Could not open pack: ' + error.message); return; }
    setReveal(data || []);
    setRevealedCount(0);
    reloadPlayerState();
    load();
    supabase.rpc('check_achievements');
    (data || []).forEach((_, i) => setTimeout(() => setRevealedCount((c) => c + 1), 260 * i + 200));
  }

  function flashToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3200); }

  return (
    <AppShell coins={playerState?.coins} gems={playerState?.gems}>
      <div className="panel">
        <h2>Open Packs</h2>
        <p className="sub">Spend coins to roll for new cards. Better packs, better odds.</p>
        <div className="pack-grid">
          {packs.map((pack) => {
            const s = pack.series_filter ? series.find((x) => x.id === pack.series_filter) : null;
            const affordable = (playerState?.coins || 0) >= pack.cost;
            return (
              <div className="pack-card" key={pack.id} style={{ '--pack-accent': pack.accent }}>
                <div className="icon">{pack.icon}</div>
                <h3>{pack.name}</h3>
                <div className="desc">{pack.pull_count} cards per pack{s ? ` · ${s.name} only` : ' · all series'}</div>
                <div className="odds">
                  {RARITIES.filter((r) => Number(pack.weights[r.id]) > 0).map((r) => (
                    <span className="chip" key={r.id} style={{ color: r.hex, borderColor: r.hex + '55' }}>{r.name}</span>
                  ))}
                </div>
                <div className="cost-row">
                  <span className="cost mono">🪙 {fmt(pack.cost)}</span>
                  <button className="btn" disabled={!affordable || opening === pack.id} onClick={() => open(pack)}>
                    {opening === pack.id ? 'Opening…' : 'Open'}
                  </button>
                </div>
              </div>
            );
          })}
          {packs.length === 0 && <div className="empty">No packs available yet.</div>}
        </div>
      </div>

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
          <div className="modal">
            <h2>Pack Results</h2>
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
