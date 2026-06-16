import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import AuthCard from '../components/ui/AuthCard';
import FormField from '../components/ui/FormField';
import PasswordStrength from '../components/ui/PasswordStrength';

const schema = z
  .object({
    password: z.string().min(12, 'At least 12 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const password = watch('password', '');

  if (!token) {
    return (
      <AuthCard title="Invalid link">
        <p className="text-center text-gray-500">
          This reset link is invalid or has expired.{' '}
          <Link to="/forgot-password" className="text-brand-600 hover:underline">
            Request a new one
          </Link>
          .
        </p>
      </AuthCard>
    );
  }

  const onSubmit = async (data: FormData) => {
    try {
      await api.post('/auth/reset-password', { token, ...data });
      setDone(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Reset failed. The link may have expired.';
      toast.error(msg);
    }
  };

  if (done) {
    return (
      <AuthCard title="Password reset!">
        <div className="text-center space-y-4">
          <div className="text-5xl">✅</div>
          <p className="text-gray-600">
            Your password has been changed. Please log in with your new password.
          </p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="w-full py-2.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-colors"
          >
            Go to login
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <FormField
            label="New password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordStrength password={password} />
        </div>
        <FormField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </AuthCard>
  );
}
