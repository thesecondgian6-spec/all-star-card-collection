'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthProvider';
import { fmt } from '../lib/gameData';

export default function DailyQuests({ onReward }) {
  const { user } = useAuth();
  const [quests, setQuests] = useState(null); // null = loading
  const [claiming, setClaiming] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    await supabase.rpc('ensure_daily_quests');
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('player_daily_quests')
      .select('*')
      .eq('user_id', user.id)
      .eq('quest_date', today)
      .order('target');
    setQuests(data || []);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // re-fetch progress periodically so quests update as the player collects/opens packs elsewhere
  useEffect(() => {
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  async function claim(templateId, reward) {
    setClaiming(templateId);
    const { data, error } = await supabase.rpc('claim_quest_reward', { p_template_id: templateId });
    setClaiming(null);
    if (error) return;
    load();
    onReward?.(data || reward);
  }

  if (quests === null) return null;
  if (quests.length === 0) return null;

  return (
    <div className="panel">
      <h2>Daily Quests</h2>
      <p className="sub">Reset every day. Complete them for bonus coins and gems.</p>
      <div className="stats-grid">
        {quests.map((q) => {
          const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
          return (
            <div className={`quest-card ${q.completed ? 'done' : ''}`} key={q.template_id}>
              <div className="qtop">
                <span className="qdesc">{q.completed ? '✅' : '🎯'} {q.description}</span>
              </div>
              <div className="quest-bar"><div style={{ width: pct + '%' }} /></div>
              <div className="qtop">
                <span className="qprogress">{fmt(q.progress)} / {fmt(q.target)}</span>
                <span className="qreward">🪙{fmt(q.coin_reward)} 💎{fmt(q.gem_reward)}</span>
              </div>
              {q.completed && !q.claimed && (
                <button className="btn small full" disabled={claiming === q.template_id} onClick={() => claim(q.template_id, { coin_reward: q.coin_reward, gem_reward: q.gem_reward })}>
                  {claiming === q.template_id ? 'Claiming…' : 'Claim Reward'}
                </button>
              )}
              {q.claimed && <button className="btn small ghost full" disabled>Claimed</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
