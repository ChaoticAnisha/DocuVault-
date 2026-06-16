import { useState } from 'react';
import { Crown, Check, HardDrive, Share2, ShieldCheck, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import Layout from '../components/Layout';
import api from '../api/axios';

const FEATURES = [
  { icon: HardDrive, text: '10 GB storage (vs 100 MB free)' },
  { icon: Share2, text: 'Unlimited document sharing' },
  { icon: ShieldCheck, text: 'Priority end-to-end encryption' },
  { icon: Zap, text: 'Advanced signature workflows' },
];

export default function Upgrade() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; url: string }>('/payments/checkout');
      if (res.data.url) {
        window.location.href = res.data.url;
      } else {
        toast.error('Failed to start checkout');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Checkout failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (user?.isPremium) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 mb-4">
            <Crown size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">You're Premium!</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            You already have access to all premium features. Thank you for your support.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto py-8 space-y-6">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 mb-4">
            <Crown size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Upgrade to Premium</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            Unlock the full power of DocuVault with our premium plan.
          </p>
        </div>

        {/* Pricing card */}
        <div className="rounded-2xl border-2 border-brand-500 bg-white dark:bg-gray-900 overflow-hidden shadow-lg">
          <div className="bg-brand-600 px-6 py-4 text-white text-center">
            <p className="text-sm font-medium uppercase tracking-wide opacity-90">Premium Plan</p>
            <div className="flex items-baseline justify-center gap-1 mt-1">
              <span className="text-4xl font-bold">£9</span>
              <span className="text-lg opacity-80">/month</span>
            </div>
          </div>

          <div className="px-6 py-5 space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                  <Check size={13} />
                </div>
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{text}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="px-6 pb-5">
            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? 'Redirecting to checkout…' : 'Upgrade Now'}
            </button>
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-3">
              Secure checkout via Stripe · Cancel anytime
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          By subscribing you agree to our terms of service. Payments are processed securely by
          Stripe.
        </p>
      </div>
    </Layout>
  );
}
