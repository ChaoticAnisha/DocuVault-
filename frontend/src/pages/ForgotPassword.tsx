import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import AuthCard from '../components/ui/AuthCard';
import FormField from '../components/ui/FormField';

const schema = z.object({ email: z.string().email('Invalid email address') });
type FormData = z.infer<typeof schema>;

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      await api.post('/auth/forgot-password', data);
      setSent(true);
    } catch {
      // Backend always returns 200 for this endpoint; any error is a network issue.
      toast.error('Something went wrong. Please try again.');
    }
  };

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <div className="text-center space-y-4">
          <div className="text-5xl">📧</div>
          <p className="text-gray-600">
            If that email is registered, you'll receive a password reset link shortly.
          </p>
          <Link to="/login" className="text-brand-600 hover:underline text-sm font-medium">
            Back to login
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot your password?" subtitle="Enter your email to receive a reset link">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          label="Email address"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </button>

        <p className="text-center text-sm text-gray-500">
          <Link to="/login" className="text-brand-600 hover:underline font-medium">
            ← Back to login
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
