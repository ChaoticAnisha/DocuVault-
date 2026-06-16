import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  ShieldCheck,
  ShieldOff,
  Download,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import zxcvbn from 'zxcvbn';
import { useAuthStore } from '../store/authStore';
import Layout from '../components/Layout';
import api from '../api/axios';

const profileSchema = z.object({
  username: z.string().min(3, 'Min 3 characters').max(32, 'Max 32 characters'),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z
      .string()
      .min(12, 'Min 12 characters')
      .regex(/[A-Z]/, 'Needs uppercase')
      .regex(/[0-9]/, 'Needs a digit')
      .regex(/[^A-Za-z0-9]/, 'Needs a special character'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
const STRENGTH_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-yellow-400',
  'bg-green-400',
  'bg-green-600',
];

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const score = zxcvbn(password).score;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? STRENGTH_COLORS[score] : 'bg-gray-200 dark:bg-gray-700'}`}
          />
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{STRENGTH_LABELS[score]}</p>
    </div>
  );
}

export default function Profile() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? '??';

  // Profile form
  const {
    register: regProfile,
    handleSubmit: handleProfile,
    formState: { errors: profileErrors, isSubmitting: profileSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { username: user?.username ?? '' },
  });

  // Password form
  const {
    register: regPwd,
    handleSubmit: handlePwd,
    watch,
    reset: resetPwd,
    formState: { errors: pwdErrors, isSubmitting: pwdSubmitting },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const newPasswordValue = watch('newPassword', '');

  const submitProfile = handleProfile(async (values) => {
    try {
      const res = await api.patch<{ success: boolean; data: typeof user }>('/users/profile', values);
      if (res.data.data) setUser(res.data.data as typeof user);
      toast.success('Profile updated');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Update failed';
      toast.error(msg);
    }
  });

  const submitPassword = handlePwd(async (values) => {
    try {
      await api.post('/users/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success('Password changed');
      resetPwd();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Change failed';
      toast.error(msg);
    }
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/users/export-data', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'docuvault-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteTyped !== 'DELETE') return;
    setDeleting(true);
    try {
      await api.delete('/users/account');
      setUser(null);
      navigate('/login');
    } catch {
      toast.error('Delete account failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile</h1>

        {/* Avatar & identity */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <div className="flex items-center gap-4 mb-5">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-white text-xl font-bold">
                {initials}
              </div>
            )}
            <div>
              <p className="text-base font-semibold text-gray-900 dark:text-white">
                {user?.username}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
              <span className="inline-block mt-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                {user?.role}
              </span>
            </div>
          </div>

          <form onSubmit={submitProfile} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Username
              </label>
              <input
                {...regProfile('username')}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              {profileErrors.username && (
                <p className="mt-1 text-xs text-red-600">{profileErrors.username.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={profileSubmitting}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {profileSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            Change Password
          </h2>
          <form onSubmit={submitPassword} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Current Password
              </label>
              <div className="relative">
                <input
                  {...regPwd('currentPassword')}
                  type={showCurrent ? 'text' : 'password'}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 pr-10 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {pwdErrors.currentPassword && (
                <p className="mt-1 text-xs text-red-600">{pwdErrors.currentPassword.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  {...regPwd('newPassword')}
                  type={showNew ? 'text' : 'password'}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 pr-10 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <PasswordStrengthMeter password={newPasswordValue} />
              {pwdErrors.newPassword && (
                <p className="mt-1 text-xs text-red-600">{pwdErrors.newPassword.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm New Password
              </label>
              <input
                {...regPwd('confirmPassword')}
                type="password"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              {pwdErrors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">{pwdErrors.confirmPassword.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={pwdSubmitting}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {pwdSubmitting ? 'Changing…' : 'Change Password'}
            </button>
          </form>
        </div>

        {/* Two-factor authentication */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {user?.mfaEnabled ? (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600">
                  <ShieldCheck size={20} />
                </div>
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600">
                  <ShieldOff size={20} />
                </div>
              )}
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Two-Factor Authentication
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {user?.mfaEnabled
                    ? 'Your account is protected with 2FA.'
                    : 'Add extra protection with an authenticator app.'}
                </p>
              </div>
            </div>
            <Link
              to="/settings/mfa"
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${user?.mfaEnabled ? 'border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
            >
              {user?.mfaEnabled ? 'Manage' : 'Enable 2FA'}
            </Link>
          </div>
          {user?.mfaEnabled && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 size={12} />
              Active
            </div>
          )}
        </div>

        {/* Account actions */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Account</h2>

          <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <Download size={17} className="text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Export Data</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Download a copy of your data</p>
              </div>
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trash2 size={17} className="text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">Delete Account</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Permanently delete your account and all data
                </p>
              </div>
            </div>
            <button
              onClick={() => setDeleteConfirmOpen(true)}
              className="rounded-lg border border-red-300 dark:border-red-700 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Delete account confirm modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-600">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Delete your account?
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  All your documents, shares, and data will be permanently deleted. This cannot be
                  undone. Type{' '}
                  <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 text-xs font-mono">
                    DELETE
                  </code>{' '}
                  to confirm.
                </p>
              </div>
            </div>
            <input
              value={deleteTyped}
              onChange={(e) => setDeleteTyped(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
              placeholder="Type DELETE"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setDeleteConfirmOpen(false); setDeleteTyped(''); }}
                className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteTyped !== 'DELETE' || deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
