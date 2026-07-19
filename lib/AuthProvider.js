'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data || null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      if (data.session?.user?.id) loadProfile(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) loadProfile(newSession.user.id);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signUpEmail = (email, password) => supabase.auth.signUp({ email, password });
  const signInEmail = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signInGuest = () => supabase.auth.signInAnonymously();
  const signOut = () => supabase.auth.signOut();

  // Converts an anonymous/guest session into a permanent email+password account
  // without losing progress (same user id, RLS-owned rows stay intact).
  const upgradeGuestAccount = (email, password) => supabase.auth.updateUser({ email, password });

  const refreshProfile = () => session?.user?.id && loadProfile(session.user.id);

  return (
    <AuthContext.Provider value={{
      session, user: session?.user || null, profile, loading: session === undefined,
      signUpEmail, signInEmail, signInGuest, signOut, upgradeGuestAccount, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
