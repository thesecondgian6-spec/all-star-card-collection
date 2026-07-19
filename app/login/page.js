'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/AuthProvider';

export default function LoginPage() {
  const { user, loading, signInEmail, signUpEmail, signInGuest } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && user) router.replace('/play'); }, [loading, user, router]);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    const action = mode === 'login' ? signInEmail(email, password) : signUpEmail(email, password);
    const { error } = await action;
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.replace('/play');
  }

  async function playAsGuest() {
    setErr(''); setBusy(true);
    const { error } = await signInGuest();
    setBusy(false);
    if (error) { setErr(error.message + ' (make sure Anonymous Sign-ins are enabled in your Supabase Auth settings)'); return; }
    router.replace('/play');
  }

  return (
    <div className="center-screen">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <div className="brand-mark">🎴</div>
          <div><h2>All Star Card Collection</h2><span className="muted">Roll · Collect · Flex</span></div>
        </div>

        <div className="auth-tabswitch">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">Log In</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')} type="button">Sign Up</button>
        </div>

        <form onSubmit={submit}>
          <div className="field field-spacer">
            <label>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field field-spacer">
            <label>Password</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </div>
          {err && <div className="errmsg">{err}</div>}
          <button className="btn full" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <hr className="sep" />
        <button className="btn ghost full" onClick={playAsGuest} disabled={busy} type="button">Continue as Guest</button>
        <p className="muted" style={{ marginTop: 10, textAlign: 'center' }}>
          Guest progress is saved too — you can add an email later from your profile.
        </p>
      </div>
    </div>
  );
}
