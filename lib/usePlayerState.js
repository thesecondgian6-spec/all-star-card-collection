'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthProvider';

export function usePlayerState() {
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('player_state').select('*').eq('user_id', user.id).single();
    setState(data);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    reload().finally(() => setLoading(false));

    const channel = supabase
      .channel('player_state_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_state', filter: `user_id=eq.${user.id}` },
        (payload) => setState(payload.new))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, reload]);

  return { state, loading, reload };
}
