import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api/axios';
import AuthCard from '../components/ui/AuthCard';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('No token provided.'); return; }
    api.get(`/auth/verify-email/${token}`)
      .then((r) => { setStatus('success'); setMessage(r.data.message); })
      .catch((e) => { setStatus('error'); setMessage(e?.response?.data?.message ?? 'Verification failed.'); });
  }, [token]);

  return (
    <AuthCard title="Email verification">
      <div className="text-center space-y-4">
        {status === 'loading' && <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent mx-auto" />}
        {status === 'success' && (<><div className="text-5xl">✅</div><p className="text-gray-600">{message}</p><Link to="/login" className="text-brand-600 hover:underline font-medium">Go to login</Link></>)}
        {status === 'error' && (<><div className="text-5xl">❌</div><p className="text-gray-600">{message}</p><Link to="/forgot-password" className="text-brand-600 hover:underline font-medium">Request a new link</Link></>)}
      </div>
    </AuthCard>
  );
}
