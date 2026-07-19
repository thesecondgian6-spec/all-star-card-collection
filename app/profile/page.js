'use client';
import { useEffect, useState, useCallback } from 'react';
import AppShell from '../../components/AppShell';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthProvider';
import { usePlayerState } from '../../lib/usePlayerState';
import { RARITY_MAP, fmt } from '../../lib/gameData';

const BANNER_COLORS = ['#a78bfa', '#f4568c', '#38bdf8', '#f5b642', '#4ade80', '#e15b5b'];

export default function ProfilePage() {
  const { user, profile, refreshProfile, upgradeGuestAccount } = useAuth();
  const { state: playerState } = usePlayerState();
  const [cards, setCards] = useState([]);
  const [ownedIds, setOwnedIds] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [unlockedIds, setUnlockedIds] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: cardData }, { data: ownedData }, { data: achData }, { data: unlockedData }] = await Promise.all([
      supabase.from('cards').select('*'),
      supabase.from('player_cards').select('card_id').eq('user_id', user.id).gt('count', 0),
      supabase.from('achievements').select('*'),
      supabase.from('player_achievements').select('achievement_id').eq('user_id', user.id),
    ]);
    setCards(cardData || []);
    setOwnedIds((ownedData || []).map((r) => r.card_id));
    setAchievements(achData || []);
    setUnlockedIds((unlockedData || []).map((r) => r.achievement_id));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  function flashToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3200); }

  function startEdit() {
    setForm({
      username: profile?.username || '',
      bio: profile?.bio || '',
      banner_color: profile?.banner_color || '#a78bfa',
      avatar_card_id: profile?.avatar_card_id || '',
      favorite_card_ids: profile?.favorite_card_ids || [],
    });
    setEditing(true);
  }

  function toggleFavorite(cardId) {
    setForm((f) => {
      const has = f.favorite_card_ids.includes(cardId);
      if (has) return { ...f, favorite_card_ids: f.favorite_card_ids.filter((id) => id !== cardId) };
      if (f.favorite_card_ids.length >= 5) { flashToast('You can only pin up to 5 favorite cards.'); return f; }
      return { ...f, favorite_card_ids: [...f.favorite_card_ids, cardId] };
    });
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      username: form.username.trim() || profile.username,
      bio: form.bio.slice(0, 280),
      banner_color: form.banner_color,
      avatar_card_id: form.avatar_card_id || null,
      favorite_card_ids: form.favorite_card_ids,
    }).eq('id', user.id);
    setSaving(false);
    if (error) { flashToast('Could not save profile: ' + error.message); return; }
    await refreshProfile();
    setEditing(false);
    flashToast('Profile saved.');
  }

  async function linkAccount(e) {
    e.preventDefault();
    setLinkBusy(true);
    const { error } = await upgradeGuestAccount(linkEmail, linkPassword);
    setLinkBusy(false);
    if (error) { flashToast('Could not link account: ' + error.message); return; }
    await refreshProfile();
    flashToast('Account linked! Check your email to confirm, then you can log in with it anywhere.');
  }

  const ownedCards = cards.filter((c) => ownedIds.includes(c.id));
  const avatarCard = cards.find((c) => c.id === profile?.avatar_card_id);
  const favoriteCards = (profile?.favorite_card_ids || []).map((id) => cards.find((c) => c.id === id)).filter(Boolean);
  const unlockedAchievements = achievements.filter((a) => unlockedIds.includes(a.id));
  const titles = unlockedAchievements.map((a) => a.title).filter(Boolean);

  return (
    <AppShell coins={playerState?.coins} gems={playerState?.gems}>
      <div className="profile-head">
        <div className="profile-banner" style={{ background: `linear-gradient(120deg, ${profile?.banner_color || '#a78bfa'}, #14121f)` }} />
        <div className="profile-avatar">
          {avatarCard?.image_url ? <img src={avatarCard.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🎴'}
        </div>
        <div className="profile-info">
          <h2 style={{ marginTop: 8 }}>{profile?.username}</h2>
          {profile?.is_guest && <span className="muted">Guest account</span>}
          <p style={{ color: 'var(--text-dim)', fontSize: 13.5, marginTop: 6 }}>{profile?.bio || 'No bio yet.'}</p>
          {titles.length > 0 && (
            <div className="row" style={{ marginTop: 10 }}>
              {titles.map((t) => <span className="badge" key={t}>🏅 {t}</span>)}
            </div>
          )}
          {!editing ? (
            <button className="btn small" style={{ marginTop: 14 }} onClick={startEdit}>Edit Profile</button>
          ) : null}
        </div>
      </div>

      {editing && form && (
        <div className="panel">
          <h2>Edit Profile</h2>
          <div className="form-grid">
            <div className="field"><label>Username</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} maxLength={24} /></div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Bio</label>
              <textarea rows={3} maxLength={280} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </div>
          </div>
          <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Banner Color</label>
          <div className="row" style={{ marginBottom: 16 }}>
            {BANNER_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setForm({ ...form, banner_color: c })}
                style={{ width: 30, height: 30, borderRadius: 8, background: c, border: form.banner_color === c ? '2px solid white' : '2px solid transparent' }} />
            ))}
          </div>
          <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Avatar (pick an owned card)</label>
          <div className="card-grid" style={{ marginBottom: 16 }}>
            {ownedCards.map((c) => {
              const rr = RARITY_MAP[c.rarity];
              const active = form.avatar_card_id === c.id;
              return (
                <div key={c.id} className="gcard" style={{ '--rc': rr.hex, outline: active ? `2px solid ${rr.hex}` : 'none' }}
                  onClick={() => setForm({ ...form, avatar_card_id: c.id })}>
                  <div className="art">{c.image_url ? <img src={c.image_url} alt="" /> : '🎴'}</div>
                  <div className="foot"><div className="name">{c.name}</div></div>
                </div>
              );
            })}
            {ownedCards.length === 0 && <p className="muted">Collect some cards first to set an avatar.</p>}
          </div>
          <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Favorite Cards (up to 5, shown to flex on your profile)</label>
          <div className="card-grid" style={{ marginBottom: 16 }}>
            {ownedCards.map((c) => {
              const rr = RARITY_MAP[c.rarity];
              const active = form.favorite_card_ids.includes(c.id);
              return (
                <div key={c.id} className="gcard" style={{ '--rc': rr.hex, outline: active ? `2px solid ${rr.hex}` : 'none' }}
                  onClick={() => toggleFavorite(c.id)}>
                  <div className="art">{c.image_url ? <img src={c.image_url} alt="" /> : '🎴'}</div>
                  <div className="foot"><div className="name">{c.name}</div></div>
                </div>
              );
            })}
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Profile'}</button>
          </div>
        </div>
      )}

      {favoriteCards.length > 0 && (
        <div className="panel">
          <h2>Showcase</h2>
          <p className="sub">Favorite cards, pinned to flex.</p>
          <div className="card-grid">
            {favoriteCards.map((c) => {
              const rr = RARITY_MAP[c.rarity];
              return (
                <div key={c.id} className="gcard" style={{ '--rc': rr.hex }}>
                  <div className="art">{c.image_url ? <img src={c.image_url} alt="" /> : '🎴'}</div>
                  <div className="foot"><div className="name">{c.name}</div><div className="meta"><span className="rtag">{rr.name}</span></div></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Stats</h2>
        <div className="stats-grid">
          <div className="stat"><div className="label">Lifetime Coins Earned</div><div className="value gold mono">{fmt(playerState?.total_coins_earned || 0)}</div></div>
          <div className="stat"><div className="label">Packs Opened</div><div className="value">{playerState?.packs_opened || 0}</div></div>
          <div className="stat"><div className="label">Login Streak</div><div className="value rose mono">{playerState?.login_streak || 0} days</div></div>
          <div className="stat"><div className="label">Unique Cards</div><div className="value">{ownedIds.length} / {cards.length}</div></div>
        </div>
      </div>

      <div className="panel">
        <h2>Achievements</h2>
        <p className="sub">Milestones unlock gems and profile titles.</p>
        <div className="stats-grid">
          {achievements.map((a) => {
            const done = unlockedIds.includes(a.id);
            return (
              <div className="stat" key={a.id} style={{ opacity: done ? 1 : 0.45 }}>
                <div className="label">{done ? '✅' : '🔒'} {a.name}</div>
                <div className="value" style={{ fontSize: 13 }}>{a.description}</div>
              </div>
            );
          })}
        </div>
      </div>

      {profile?.is_guest && (
        <div className="panel">
          <h2>Save Your Progress</h2>
          <p className="sub">You're playing as a guest. Add an email and password to keep your binder safe across devices — nothing about your progress changes.</p>
          <form onSubmit={linkAccount} className="form-grid">
            <div className="field"><label>Email</label><input type="email" required value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} /></div>
            <div className="field"><label>Password</label><input type="password" required minLength={6} value={linkPassword} onChange={(e) => setLinkPassword(e.target.value)} /></div>
            <div className="field" style={{ alignSelf: 'end' }}><button className="btn full" disabled={linkBusy}>{linkBusy ? 'Linking…' : 'Link Account'}</button></div>
          </form>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </AppShell>
  );
}
