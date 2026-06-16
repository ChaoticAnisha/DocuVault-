import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  FileText,
  HardDrive,
  Crown,
  Lock,
  Unlock,
  ChevronDown,
  Download,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import ActivityFeed from '../components/ActivityFeed';
import api from '../api/axios';
import type { AdminStats, AdminUser, ActivityLog } from '../types';
import clsx from 'clsx';

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  EDITOR: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  VIEWER: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

function StatCard({
  icon: Icon,
  label,
  value,
  color = 'text-brand-500',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 flex items-start gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function formatBytes(bytes: string | number) {
  const n = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(0)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

function exportCSV(users: AdminUser[]) {
  const headers = ['ID', 'Email', 'Username', 'Role', 'Premium', 'MFA', 'Email Verified', 'Created'];
  const rows = users.map((u) => [
    u.id,
    u.email,
    u.username,
    u.role,
    u.isPremium ? 'Yes' : 'No',
    u.mfaEnabled ? 'Yes' : 'No',
    u.isEmailVerified ? 'Yes' : 'No',
    new Date(u.createdAt).toLocaleDateString(),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminDashboard() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [roleDropdown, setRoleDropdown] = useState<string | null>(null);

  const { data: statsData } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () =>
      api.get<{ success: boolean; data: AdminStats }>('/admin/stats').then((r) => r.data),
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin', 'users', page],
    queryFn: () =>
      api
        .get<{ success: boolean; data: AdminUser[]; pagination: { total: number; pages: number } }>(
          `/admin/users?page=${page}&limit=15`
        )
        .then((r) => r.data),
  });

  const stats = statsData?.data;
  const users = usersData?.data ?? [];
  const pagination = usersData?.pagination;

  const lockMutation = useMutation({
    mutationFn: ({ id, locked }: { id: string; locked: boolean }) =>
      locked
        ? api.post(`/admin/users/${id}/lock`)
        : api.post(`/admin/users/${id}/unlock`),
    onSuccess: (_, vars) => {
      toast.success(vars.locked ? 'User locked' : 'User unlocked');
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: () => toast.error('Action failed'),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(`/admin/users/${id}/role`, { role }),
    onSuccess: () => {
      toast.success('Role updated');
      setRoleDropdown(null);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Update failed';
      toast.error(msg);
    },
  });

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total Users" value={stats?.totalUsers ?? '—'} />
          <StatCard
            icon={Crown}
            label="Premium Users"
            value={stats?.premiumUsers ?? '—'}
            color="text-yellow-500"
          />
          <StatCard
            icon={FileText}
            label="Total Documents"
            value={stats?.totalDocuments ?? '—'}
            color="text-blue-500"
          />
          <StatCard
            icon={HardDrive}
            label="Storage Used"
            value={stats ? formatBytes(stats.totalStorageUsed) : '—'}
            color="text-purple-500"
          />
        </div>

        {/* Users table + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Users table */}
          <div className="lg:col-span-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Users</h2>
              <button
                onClick={() => users.length > 0 && exportCSV(users)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Download size={12} />
                CSV
              </button>
            </div>

            {usersLoading ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                    <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/5" />
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {users.map((u) => {
                  const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                  return (
                    <div key={u.id} className="flex items-center gap-3 px-5 py-3.5">
                      {/* Avatar */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-semibold">
                        {u.username.slice(0, 2).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                            {u.username}
                          </span>
                          <span
                            className={clsx(
                              'rounded-full px-1.5 py-0.5 text-xs font-medium',
                              ROLE_COLORS[u.role]
                            )}
                          >
                            {u.role}
                          </span>
                          {u.isPremium && (
                            <Crown size={11} className="text-yellow-500 shrink-0" />
                          )}
                          {u.mfaEnabled ? (
                            <ShieldCheck size={11} className="text-green-500 shrink-0" />
                          ) : (
                            <ShieldOff size={11} className="text-gray-400 shrink-0" />
                          )}
                          {isLocked && (
                            <span className="rounded-full bg-red-100 dark:bg-red-900/20 px-1.5 py-0.5 text-xs text-red-600 dark:text-red-400 font-medium">
                              Locked
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {u.email}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Role dropdown */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setRoleDropdown(roleDropdown === u.id ? null : u.id)
                            }
                            className="flex items-center gap-0.5 rounded-md px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            Role
                            <ChevronDown size={11} />
                          </button>
                          {roleDropdown === u.id && (
                            <div className="absolute right-0 top-full mt-1 z-20 w-28 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
                              {(['ADMIN', 'EDITOR', 'VIEWER'] as const).map((r) => (
                                <button
                                  key={r}
                                  onClick={() => roleMutation.mutate({ id: u.id, role: r })}
                                  className={clsx(
                                    'w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800',
                                    u.role === r
                                      ? 'font-semibold text-brand-600'
                                      : 'text-gray-700 dark:text-gray-300'
                                  )}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Lock/unlock */}
                        <button
                          onClick={() => lockMutation.mutate({ id: u.id, locked: !isLocked })}
                          disabled={lockMutation.isPending}
                          title={isLocked ? 'Unlock user' : 'Lock user'}
                          className={clsx(
                            'p-1.5 rounded-md transition-colors',
                            isLocked
                              ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                              : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                          )}
                        >
                          {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-800">
                <span className="text-xs text-gray-500">{pagination.total} users</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded border border-gray-300 dark:border-gray-700 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-gray-500 self-center">
                    {page}/{pagination.pages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                    disabled={page === pagination.pages}
                    className="rounded border border-gray-300 dark:border-gray-700 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div className="lg:col-span-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              Recent Activity
            </h2>
            <ActivityFeed
              logs={(stats?.recentLogs ?? []) as ActivityLog[]}
              isLoading={!stats}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
