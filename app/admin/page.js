'use client';
import { useEffect, useState, useCallback } from 'react';
import AppShell from '../../components/AppShell';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthProvider';
import { usePlayerState } from '../../lib/usePlayerState';
import { RARITIES, RARITY_MAP } from '../../lib/gameData';

export default function AdminPage() {
  const { profile, user } = useAuth();
  const { state: playerState } = usePlayerState();

  if (profile && !profile.is_admin) {
    return (
      <AppShell coins={playerState?.coins} gems={playerState?.gems}>
        <div className="panel">
          <h2>Admin Access Required</h2>
          <p className="sub">
            Your account isn't an admin yet. In the Supabase Table Editor, open the <code>profiles</code> table,
            find the row where <code>id</code> = <code>{user?.id}</code>, and set <code>is_admin</code> to <code>true</code>.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell coins={playerState?.coins} gems={playerState?.gems}>
      <div className="panel">
        <h2>Admin Panel</h2>
        <p className="sub">Manage series, cards, packs, upgrades, and achievements. Changes apply instantly.</p>
        <AdminBody />
      </div>
    </AppShell>
  );
}

function AdminBody() {
  const [tab, setTab] = useState('series');
  const tabs = ['series', 'cards', 'packs', 'upgrades', 'achievements', 'quests', 'rebirths'];
  return (
    <>
      <div className="admin-tabs">
        {tabs.map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
      {tab === 'series' && <SeriesAdmin />}
      {tab === 'cards' && <CardsAdmin />}
      {tab === 'packs' && <PacksAdmin />}
      {tab === 'upgrades' && <UpgradesAdmin />}
      {tab === 'achievements' && <AchievementsAdmin />}
      {tab === 'quests' && <QuestsAdmin />}
      {tab === 'rebirths' && <RebirthsAdmin />}
    </>
  );
}

function useToast() {
  const [toast, setToast] = useState('');
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };
  return [toast, flash];
}

/* ---------------- SERIES ---------------- */
function SeriesAdmin() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [toast, flash] = useToast();
  const load = useCallback(async () => { const { data } = await supabase.from('series').select('*').order('sort_order'); setRows(data || []); }, []);
  useEffect(() => { load(); }, [load]);

  function newForm() { setForm({ id: '', name: '', icon: '🎴', accent: '#a78bfa', sort_order: rows.length + 1, isNew: true }); }
  function editForm(r) { setForm({ ...r, isNew: false }); }

  async function save() {
    if (!form.name.trim()) { flash('Series needs a name.'); return; }
    const id = form.isNew ? (form.id.trim() || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')) : form.id;
    const payload = { id, name: form.name.trim(), icon: form.icon || '🎴', accent: form.accent, sort_order: Number(form.sort_order) || 0 };
    const { error } = form.isNew ? await supabase.from('series').insert(payload) : await supabase.from('series').update(payload).eq('id', form.id);
    if (error) { flash('Save failed: ' + error.message); return; }
    setForm(null); load();
  }
  async function del(id) {
    if (!confirm('Delete this series? Its cards will be removed too.')) return;
    const { error } = await supabase.from('series').delete().eq('id', id);
    if (error) { flash('Delete failed: ' + error.message); return; }
    load();
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn small" onClick={newForm}>+ Add Series</button>
      </div>
      <div className="table-scroll"><table className="admtable">
        <thead><tr><th>Icon</th><th>Name</th><th>Accent</th><th></th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td style={{ fontSize: 18 }}>{s.icon}</td>
              <td>{s.name}</td>
              <td><span className="swatch" style={{ background: s.accent }} />{s.accent}</td>
              <td className="row">
                <button className="btn small ghost" onClick={() => editForm(s)}>Edit</button>
                <button className="btn small danger" onClick={() => del(s.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {rows.length === 0 && <div className="empty">No series yet.</div>}
      {form && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setForm(null)}>
          <div className="modal">
            <h2>{form.isNew ? 'Add' : 'Edit'} Series</h2>
            <div className="form-grid">
              {form.isNew && <div className="field"><label>ID (slug, optional)</label><input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="auto-generated from name" /></div>}
              <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field"><label>Icon (emoji)</label><input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={4} /></div>
              <div className="field"><label>Accent Color</label><input type="color" value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} style={{ height: 38, padding: 4 }} /></div>
              <div className="field"><label>Sort Order</label><input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn" onClick={save}>Save Series</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ---------------- CARDS ---------------- */
function CardsAdmin() {
  const [rows, setRows] = useState([]);
  const [seriesList, setSeriesList] = useState([]);
  const [form, setForm] = useState(null);
  const [toast, flash] = useToast();
  const load = useCallback(async () => {
    const [{ data: c }, { data: s }] = await Promise.all([supabase.from('cards').select('*'), supabase.from('series').select('*').order('sort_order')]);
    setRows(c || []); setSeriesList(s || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  function newForm() {
    setForm({ id: '', series_id: seriesList[0]?.id || '', name: '', rarity: 'common', image_url: '', flavor: '', earn_rate: 0.1, cap_hours: 8, isNew: true });
  }
  function editForm(r) { setForm({ ...r, isNew: false }); }

  async function save() {
    if (!form.name.trim()) { flash('Card needs a name.'); return; }
    if (!form.series_id) { flash('Add a series first.'); return; }
    const id = form.isNew ? (form.id.trim() || `${form.series_id}-${form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`) : form.id;
    const payload = {
      id, series_id: form.series_id, name: form.name.trim(), rarity: form.rarity,
      image_url: form.image_url || '', flavor: form.flavor || '',
      earn_rate: Number(form.earn_rate) || 0.1, cap_hours: Number(form.cap_hours) || 8,
    };
    const { error } = form.isNew ? await supabase.from('cards').insert(payload) : await supabase.from('cards').update(payload).eq('id', form.id);
    if (error) { flash('Save failed: ' + error.message); return; }
    setForm(null); load();
  }
  async function del(id) {
    if (!confirm('Delete this card?')) return;
    const { error } = await supabase.from('cards').delete().eq('id', id);
    if (error) { flash('Delete failed: ' + error.message); return; }
    load();
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn small" onClick={newForm} disabled={seriesList.length === 0}>+ Add Card</button>
      </div>
      <div className="table-scroll"><table className="admtable">
        <thead><tr><th>Name</th><th>Series</th><th>Rarity</th><th>Rate</th><th></th></tr></thead>
        <tbody>
          {rows.map((c) => {
            const s = seriesList.find((x) => x.id === c.series_id);
            const rr = RARITY_MAP[c.rarity];
            return (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{s ? `${s.icon} ${s.name}` : <span className="muted">unassigned</span>}</td>
                <td><span className="swatch" style={{ background: rr?.hex }} />{rr?.name}</td>
                <td className="mono">{c.earn_rate}/s</td>
                <td className="row">
                  <button className="btn small ghost" onClick={() => editForm(c)}>Edit</button>
                  <button className="btn small danger" onClick={() => del(c.id)}>Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      {rows.length === 0 && <div className="empty">No cards yet.</div>}
      {form && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setForm(null)}>
          <div className="modal">
            <h2>{form.isNew ? 'Add' : 'Edit'} Card</h2>
            <div className="form-grid">
              <div className="field" style={{ gridColumn: '1/-1' }}><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field">
                <label>Series</label>
                <select value={form.series_id} onChange={(e) => setForm({ ...form, series_id: e.target.value })}>
                  {seriesList.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Rarity</label>
                <select value={form.rarity} onChange={(e) => setForm({ ...form, rarity: e.target.value })}>
                  {RARITIES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Earn Rate (coins/sec per copy)</label><input type="number" step="0.01" value={form.earn_rate} onChange={(e) => setForm({ ...form, earn_rate: e.target.value })} /></div>
              <div className="field"><label>Storage Cap (hours)</label><input type="number" step="0.5" value={form.cap_hours} onChange={(e) => setForm({ ...form, cap_hours: e.target.value })} /></div>
              <div className="field" style={{ gridColumn: '1/-1' }}><label>Image URL (optional)</label><input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." /></div>
              <div className="field" style={{ gridColumn: '1/-1' }}><label>Flavor Text (optional)</label><input value={form.flavor} onChange={(e) => setForm({ ...form, flavor: e.target.value })} /></div>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn" onClick={save}>Save Card</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ---------------- PACKS ---------------- */
function PacksAdmin() {
  const [rows, setRows] = useState([]);
  const [seriesList, setSeriesList] = useState([]);
  const [form, setForm] = useState(null);
  const [toast, flash] = useToast();
  const load = useCallback(async () => {
    const [{ data: p }, { data: s }] = await Promise.all([supabase.from('packs').select('*'), supabase.from('series').select('*').order('sort_order')]);
    setRows(p || []); setSeriesList(s || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  function newForm() {
    setForm({ id: '', name: '', icon: '📦', cost: 100, series_filter: '', accent: '#a78bfa', required_rebirth: 0,
      weights: { common: 50, uncommon: 30, rare: 14, epic: 5, legendary: 1, mythic: 0 }, isNew: true });
  }
  function editForm(r) { setForm({ ...r, isNew: false }); }

  async function save() {
    if (!form.name.trim()) { flash('Pack needs a name.'); return; }
    const id = form.isNew ? (form.id.trim() || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')) : form.id;
    const payload = {
      id, name: form.name.trim(), icon: form.icon || '📦', cost: Number(form.cost) || 0,
      series_filter: form.series_filter || null, accent: form.accent, weights: form.weights,
      required_rebirth: Math.max(0, Number(form.required_rebirth) || 0),
    };
    const { error } = form.isNew ? await supabase.from('packs').insert(payload) : await supabase.from('packs').update(payload).eq('id', form.id);
    if (error) { flash('Save failed: ' + error.message); return; }
    setForm(null); load();
  }
  async function del(id) {
    if (!confirm('Delete this pack?')) return;
    const { error } = await supabase.from('packs').delete().eq('id', id);
    if (error) { flash('Delete failed: ' + error.message); return; }
    load();
  }

  return (
    <>
      <p className="muted" style={{ marginBottom: 10 }}>Every pack now gives exactly 1 card per spin — cost is per spin. Players unlock multi-spin batches via the Multi-Spin upgrade.</p>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn small" onClick={newForm}>+ Add Pack</button>
      </div>
      <div className="table-scroll"><table className="admtable">
        <thead><tr><th>Name</th><th>Cost/Spin</th><th>Series Filter</th><th>Requires Rebirth</th><th></th></tr></thead>
        <tbody>
          {rows.map((p) => {
            const s = p.series_filter ? seriesList.find((x) => x.id === p.series_filter) : null;
            return (
              <tr key={p.id}>
                <td>{p.icon} {p.name}</td>
                <td className="mono">{p.cost}</td>
                <td>{s ? s.name : 'All'}</td>
                <td>{p.required_rebirth > 0 ? `🔒 ${p.required_rebirth}` : '—'}</td>
                <td className="row">
                  <button className="btn small ghost" onClick={() => editForm(p)}>Edit</button>
                  <button className="btn small danger" onClick={() => del(p.id)}>Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      {rows.length === 0 && <div className="empty">No packs yet.</div>}
      {form && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setForm(null)}>
          <div className="modal">
            <h2>{form.isNew ? 'Add' : 'Edit'} Pack</h2>
            <div className="form-grid">
              <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field"><label>Icon</label><input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={4} /></div>
              <div className="field"><label>Cost per Spin (coins)</label><input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
              <div className="field"><label>Requires Rebirth Level</label><input type="number" min="0" value={form.required_rebirth} onChange={(e) => setForm({ ...form, required_rebirth: e.target.value })} /></div>
              <div className="field">
                <label>Restrict to Series</label>
                <select value={form.series_filter || ''} onChange={(e) => setForm({ ...form, series_filter: e.target.value })}>
                  <option value="">All series</option>
                  {seriesList.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Accent Color</label><input type="color" value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} style={{ height: 38, padding: 4 }} /></div>
            </div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Drop weights (relative, don&apos;t need to total 100)</label>
            <div className="weights-grid">
              {RARITIES.map((r) => (
                <div className="field" key={r.id}>
                  <label style={{ color: r.hex }}>{r.name}</label>
                  <input type="number" min="0" value={form.weights[r.id] ?? 0} onChange={(e) => setForm({ ...form, weights: { ...form.weights, [r.id]: Number(e.target.value) } })} />
                </div>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn" onClick={save}>Save Pack</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ---------------- UPGRADES ---------------- */
function UpgradesAdmin() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [toast, flash] = useToast();
  const load = useCallback(async () => { const { data } = await supabase.from('upgrades').select('*').order('sort_order'); setRows(data || []); }, []);
  useEffect(() => { load(); }, [load]);

  function newForm() { setForm({ id: '', name: '', description: '', category: 'multiplier', currency: 'gems', base_cost: 15, cost_growth: 1.5, effect_value: 0.1, max_level: 10, sort_order: rows.length + 1, required_rebirth: 0, isNew: true }); }
  function editForm(r) { setForm({ ...r, isNew: false }); }

  async function save() {
    if (!form.name.trim()) { flash('Upgrade needs a name.'); return; }
    const id = form.isNew ? (form.id.trim() || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')) : form.id;
    const payload = {
      id, name: form.name.trim(), description: form.description || '', category: form.category, currency: form.currency,
      base_cost: Number(form.base_cost) || 1, cost_growth: Number(form.cost_growth) || 1.5,
      effect_value: Number(form.effect_value) || 0, max_level: Number(form.max_level) || 1, sort_order: Number(form.sort_order) || 0,
      required_rebirth: Math.max(0, Number(form.required_rebirth) || 0),
    };
    const { error } = form.isNew ? await supabase.from('upgrades').insert(payload) : await supabase.from('upgrades').update(payload).eq('id', form.id);
    if (error) { flash('Save failed: ' + error.message); return; }
    setForm(null); load();
  }
  async function del(id) {
    if (!confirm('Delete this upgrade?')) return;
    const { error } = await supabase.from('upgrades').delete().eq('id', id);
    if (error) { flash('Delete failed: ' + error.message); return; }
    load();
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn small" onClick={newForm}>+ Add Upgrade</button>
      </div>
      <div className="table-scroll"><table className="admtable">
        <thead><tr><th>Name</th><th>Category</th><th>Currency</th><th>Base Cost</th><th>Growth</th><th>Effect</th><th>Max Lvl</th><th>Rebirth</th><th></th></tr></thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td><td>{u.category}</td><td>{u.currency === 'coins' ? '🪙 coins' : '💎 gems'}</td>
              <td className="mono">{u.base_cost}</td>
              <td className="mono">x{u.cost_growth}</td><td className="mono">{u.effect_value}</td><td>{u.max_level}</td>
              <td>{u.required_rebirth > 0 ? `🔒 ${u.required_rebirth}` : '—'}</td>
              <td className="row">
                <button className="btn small ghost" onClick={() => editForm(u)}>Edit</button>
                <button className="btn small danger" onClick={() => del(u.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {rows.length === 0 && <div className="empty">No upgrades yet.</div>}
      {form && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setForm(null)}>
          <div className="modal">
            <h2>{form.isNew ? 'Add' : 'Edit'} Upgrade</h2>
            <div className="form-grid">
              <div className="field" style={{ gridColumn: '1/-1' }}><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field" style={{ gridColumn: '1/-1' }}><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="field">
                <label>Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="auto_collect">Auto Collect</option>
                  <option value="multiplier">Multiplier</option>
                  <option value="capacity">Capacity</option>
                  <option value="luck">Luck</option>
                  <option value="offline">Offline</option>
                  <option value="multi_spin">Multi-Spin</option>
                </select>
              </div>
              <div className="field">
                <label>Currency</label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="gems">💎 Gems (utility upgrades)</option>
                  <option value="coins">🪙 Coins (income upgrades)</option>
                </select>
              </div>
              <div className="field"><label>Base Cost</label><input type="number" value={form.base_cost} onChange={(e) => setForm({ ...form, base_cost: e.target.value })} /></div>
              <div className="field"><label>Cost Growth (per level)</label><input type="number" step="0.01" value={form.cost_growth} onChange={(e) => setForm({ ...form, cost_growth: e.target.value })} /></div>
              <div className="field"><label>Effect Value (per level)</label><input type="number" step="0.01" value={form.effect_value} onChange={(e) => setForm({ ...form, effect_value: e.target.value })} /></div>
              <div className="field"><label>Max Level</label><input type="number" value={form.max_level} onChange={(e) => setForm({ ...form, max_level: e.target.value })} /></div>
              <div className="field"><label>Requires Rebirth Level</label><input type="number" min="0" value={form.required_rebirth} onChange={(e) => setForm({ ...form, required_rebirth: e.target.value })} /></div>
            </div>
            <p className="muted">Multiplier effect = +effect_value per level (e.g. 0.1 = +10% per level). Capacity effect = +hours per level. Multi-Spin effect isn&apos;t used — each level just adds +1 max simultaneous spin.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn" onClick={save}>Save Upgrade</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ---------------- QUESTS ---------------- */
function QuestsAdmin() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [toast, flash] = useToast();
  const load = useCallback(async () => { const { data } = await supabase.from('quest_templates').select('*'); setRows(data || []); }, []);
  useEffect(() => { load(); }, [load]);

  function newForm() { setForm({ id: '', description: '', quest_type: 'open_packs', target_value: 3, coin_reward: 100, gem_reward: 2, weight: 1, isNew: true }); }
  function editForm(r) { setForm({ ...r, isNew: false }); }

  async function save() {
    if (!form.description.trim()) { flash('Quest needs a description.'); return; }
    const id = form.isNew ? (form.id.trim() || form.description.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)) : form.id;
    const payload = {
      id, description: form.description.trim(), quest_type: form.quest_type,
      target_value: Number(form.target_value) || 1, coin_reward: Number(form.coin_reward) || 0,
      gem_reward: Number(form.gem_reward) || 0, weight: Number(form.weight) || 1,
    };
    const { error } = form.isNew ? await supabase.from('quest_templates').insert(payload) : await supabase.from('quest_templates').update(payload).eq('id', form.id);
    if (error) { flash('Save failed: ' + error.message); return; }
    setForm(null); load();
  }
  async function del(id) {
    if (!confirm('Delete this quest? Any players currently doing it today will lose that progress.')) return;
    const { error } = await supabase.from('quest_templates').delete().eq('id', id);
    if (error) { flash('Delete failed: ' + error.message); return; }
    load();
  }

  return (
    <>
      <p className="muted" style={{ marginBottom: 10 }}>Every player gets 3 random quests per day from this pool. Higher weight = more likely to be picked.</p>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn small" onClick={newForm}>+ Add Quest</button>
      </div>
      <div className="table-scroll"><table className="admtable">
        <thead><tr><th>Description</th><th>Type</th><th>Target</th><th>Reward</th><th>Weight</th><th></th></tr></thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.id}>
              <td>{q.description}</td><td>{q.quest_type}</td><td className="mono">{q.target_value}</td>
              <td className="mono">🪙{q.coin_reward} 💎{q.gem_reward}</td><td>{q.weight}</td>
              <td className="row">
                <button className="btn small ghost" onClick={() => editForm(q)}>Edit</button>
                <button className="btn small danger" onClick={() => del(q.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {rows.length === 0 && <div className="empty">No quest templates yet.</div>}
      {form && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setForm(null)}>
          <div className="modal">
            <h2>{form.isNew ? 'Add' : 'Edit'} Quest</h2>
            <div className="form-grid">
              <div className="field" style={{ gridColumn: '1/-1' }}><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Open 3 packs" /></div>
              <div className="field">
                <label>Type</label>
                <select value={form.quest_type} onChange={(e) => setForm({ ...form, quest_type: e.target.value })}>
                  <option value="open_packs">Open Packs</option>
                  <option value="collect_coins">Collect Coins</option>
                  <option value="collect_clicks">Tap-to-Collect Count</option>
                </select>
              </div>
              <div className="field"><label>Target Value</label><input type="number" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} /></div>
              <div className="field"><label>Coin Reward</label><input type="number" value={form.coin_reward} onChange={(e) => setForm({ ...form, coin_reward: e.target.value })} /></div>
              <div className="field"><label>Gem Reward</label><input type="number" value={form.gem_reward} onChange={(e) => setForm({ ...form, gem_reward: e.target.value })} /></div>
              <div className="field"><label>Weight (selection odds)</label><input type="number" step="0.1" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></div>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn" onClick={save}>Save Quest</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
/* ---------------- REBIRTHS ---------------- */
function RebirthsAdmin() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [toast, flash] = useToast();
  const load = useCallback(async () => { const { data } = await supabase.from('rebirths').select('*').order('level'); setRows(data || []); }, []);
  useEffect(() => { load(); }, [load]);

  function newForm() {
    const nextLevel = rows.length ? Math.max(...rows.map((r) => r.level)) + 1 : 1;
    setForm({ level: nextLevel, name: '', description: '', coin_requirement: 50000, multiplier_bonus: 0.5, gem_reward: 20, isNew: true });
  }
  function editForm(r) { setForm({ ...r, isNew: false }); }

  async function save() {
    if (!form.name.trim()) { flash('Rebirth tier needs a name.'); return; }
    const payload = {
      level: Number(form.level) || 1, name: form.name.trim(), description: form.description || '',
      coin_requirement: Number(form.coin_requirement) || 0, multiplier_bonus: Number(form.multiplier_bonus) || 0,
      gem_reward: Number(form.gem_reward) || 0,
    };
    const { error } = form.isNew ? await supabase.from('rebirths').insert(payload) : await supabase.from('rebirths').update(payload).eq('level', form.level);
    if (error) { flash('Save failed: ' + error.message); return; }
    setForm(null); load();
  }
  async function del(level) {
    if (!confirm('Delete this rebirth tier? Players already past it keep their bonus, but no one can reach it again.')) return;
    const { error } = await supabase.from('rebirths').delete().eq('level', level);
    if (error) { flash('Delete failed: ' + error.message); return; }
    load();
  }

  return (
    <>
      <p className="muted" style={{ marginBottom: 10 }}>Players rebirth by spending their current coins for a permanent income multiplier. Coins reset, but cards/upgrades/gems never do. Tiers must be reached in order (level N+1 needs the player to already be at level N).</p>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn small" onClick={newForm}>+ Add Rebirth Tier</button>
      </div>
      <div className="table-scroll"><table className="admtable">
        <thead><tr><th>Level</th><th>Name</th><th>Coin Requirement</th><th>Multiplier Bonus</th><th>Gem Reward</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.level}>
              <td>{r.level}</td><td>{r.name}</td><td className="mono">{r.coin_requirement}</td>
              <td className="mono">+{Math.round(r.multiplier_bonus * 100)}%</td><td className="mono">💎{r.gem_reward}</td>
              <td className="row">
                <button className="btn small ghost" onClick={() => editForm(r)}>Edit</button>
                <button className="btn small danger" onClick={() => del(r.level)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {rows.length === 0 && <div className="empty">No rebirth tiers yet — players won&apos;t be able to rebirth until you add some.</div>}
      {form && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setForm(null)}>
          <div className="modal">
            <h2>{form.isNew ? 'Add' : 'Edit'} Rebirth Tier</h2>
            <div className="form-grid">
              <div className="field"><label>Level</label><input type="number" min="1" value={form.level} disabled={!form.isNew} onChange={(e) => setForm({ ...form, level: e.target.value })} /></div>
              <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field" style={{ gridColumn: '1/-1' }}><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="field"><label>Coin Requirement</label><input type="number" value={form.coin_requirement} onChange={(e) => setForm({ ...form, coin_requirement: e.target.value })} /></div>
              <div className="field"><label>Multiplier Bonus (0.5 = +50%)</label><input type="number" step="0.05" value={form.multiplier_bonus} onChange={(e) => setForm({ ...form, multiplier_bonus: e.target.value })} /></div>
              <div className="field"><label>Gem Reward</label><input type="number" value={form.gem_reward} onChange={(e) => setForm({ ...form, gem_reward: e.target.value })} /></div>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn" onClick={save}>Save Tier</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ---------------- ACHIEVEMENTS ---------------- */
function AchievementsAdmin() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [toast, flash] = useToast();
  const load = useCallback(async () => { const { data } = await supabase.from('achievements').select('*'); setRows(data || []); }, []);
  useEffect(() => { load(); }, [load]);

  function newForm() { setForm({ id: '', name: '', description: '', condition_type: 'packs_opened', condition_value: 10, gem_reward: 10, title: '', isNew: true }); }
  function editForm(r) { setForm({ ...r, isNew: false }); }

  async function save() {
    if (!form.name.trim()) { flash('Achievement needs a name.'); return; }
    const id = form.isNew ? (form.id.trim() || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')) : form.id;
    const payload = {
      id, name: form.name.trim(), description: form.description || '', condition_type: form.condition_type,
      condition_value: Number(form.condition_value) || 0, gem_reward: Number(form.gem_reward) || 0, title: form.title || null,
    };
    const { error } = form.isNew ? await supabase.from('achievements').insert(payload) : await supabase.from('achievements').update(payload).eq('id', form.id);
    if (error) { flash('Save failed: ' + error.message); return; }
    setForm(null); load();
  }
  async function del(id) {
    if (!confirm('Delete this achievement?')) return;
    const { error } = await supabase.from('achievements').delete().eq('id', id);
    if (error) { flash('Delete failed: ' + error.message); return; }
    load();
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn small" onClick={newForm}>+ Add Achievement</button>
      </div>
      <div className="table-scroll"><table className="admtable">
        <thead><tr><th>Name</th><th>Condition</th><th>Reward</th><th>Title</th><th></th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td className="mono">{a.condition_type} ≥ {a.condition_value}</td>
              <td className="mono">💎{a.gem_reward}</td>
              <td>{a.title || <span className="muted">none</span>}</td>
              <td className="row">
                <button className="btn small ghost" onClick={() => editForm(a)}>Edit</button>
                <button className="btn small danger" onClick={() => del(a.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {rows.length === 0 && <div className="empty">No achievements yet.</div>}
      {form && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setForm(null)}>
          <div className="modal">
            <h2>{form.isNew ? 'Add' : 'Edit'} Achievement</h2>
            <div className="form-grid">
              <div className="field" style={{ gridColumn: '1/-1' }}><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field" style={{ gridColumn: '1/-1' }}><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="field">
                <label>Condition Type</label>
                <select value={form.condition_type} onChange={(e) => setForm({ ...form, condition_type: e.target.value })}>
                  <option value="packs_opened">Packs Opened</option>
                  <option value="unique_cards">Unique Cards</option>
                  <option value="collection_pct">Collection %</option>
                  <option value="total_coins_earned">Total Coins Earned</option>
                </select>
              </div>
              <div className="field"><label>Condition Value</label><input type="number" value={form.condition_value} onChange={(e) => setForm({ ...form, condition_value: e.target.value })} /></div>
              <div className="field"><label>Gem Reward</label><input type="number" value={form.gem_reward} onChange={(e) => setForm({ ...form, gem_reward: e.target.value })} /></div>
              <div className="field"><label>Title Unlocked (optional)</label><input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Master Collector" /></div>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn" onClick={save}>Save Achievement</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
