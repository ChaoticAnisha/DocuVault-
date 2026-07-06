import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuthStore } from '../store/authStore';
import AuthCard from '../components/ui/AuthCard';
import type { User } from '../types';

interface LocationState {
  tempToken?: string;
}

export default function VerifyMfa() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuthStore();
  const tempToken = (location.state as LocationState)?.tempToken;

  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Guard: no tempToken means the user navigated here directly — send them to login.
  useEffect(() => {
    if (!tempToken) navigate('/login', { replace: true });
    inputRef.current?.focus();
  }, [tempToken, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await api.post<{ success: boolean; user: User }>(
        '/auth/verify-mfa',
        { tempToken, code }
      );
      setUser(res.data.user);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { message?: string }; status?: number } })
        ?.response;
      const msg = response?.data?.message ?? 'Invalid code';
      toast.error(msg);

      // If backend returns remaining attempts in the message, surface it.
      if (msg.toLowerCase().includes('attempt')) {
        setAttemptsLeft((prev) => (prev !== null ? prev - 1 : 2));
      }
      if (response?.status === 429 || (attemptsLeft !== null && attemptsLeft <= 0)) {
        navigate('/login', { replace: true });
        toast.error('Too many failed attempts. Please log in again.');
        return;
      }

      setCode('');
      inputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(val);
  };

  return (
    <AuthCard
      title="Two-Factor Authentication (TOTP)"
      subtitle="Enter the 6-digit code from your authenticator app (Google Authenticator / Authy)"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
            Authentication code
          </label>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={handleChange}
            placeholder="000000"
            className="block w-full text-center text-3xl font-mono tracking-[0.5em] rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-200"
            autoComplete="one-time-code"
          />
          <p className="mt-2 text-center text-xs text-gray-400">Codes refresh every 30 seconds</p>
        </div>

        {attemptsLeft !== null && (
          <p className="text-center text-sm text-amber-600">
            {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
          </p>
        )}

        <button
          type="submit"
          disabled={code.length !== 6 || isSubmitting}
          className="w-full py-2.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Verifying…' : 'Verify'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          className="w-full text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to login
        </button>
      </form>
    </AuthCard>
  );
}
