import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Upload, Users, HardDrive, Plus, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import Layout from '../components/Layout';
import ActivityFeed from '../components/ActivityFeed';
import DocumentUpload from '../components/DocumentUpload';
import api from '../api/axios';
import type { ActivityLog, Document } from '../types';
import clsx from 'clsx';

function StorageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const critical = pct > 80;
  const usedStr =
    used >= 1024 * 1024 * 1024
      ? `${(used / 1024 / 1024 / 1024).toFixed(1)} GB`
      : `${(used / 1024 / 1024).toFixed(0)} MB`;
  const limitStr =
    limit >= 1024 * 1024 * 1024
      ? `${(limit / 1024 / 1024 / 1024).toFixed(0)} GB`
      : `${(limit / 1024 / 1024).toFixed(0)} MB`;

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
        <span>{usedStr} used</span>
        <span>{limitStr} total</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={clsx(
            'h-2 rounded-full transition-all duration-500',
            critical ? 'bg-red-500' : 'bg-brand-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between items-center mt-1.5">
        <span className={clsx('text-xs font-medium', critical ? 'text-red-600' : 'text-gray-500')}>
          {pct}%
        </span>
        {critical && (
          <Link to="/upgrade" className="text-xs text-brand-600 hover:underline font-medium">
            Upgrade for more space →
          </Link>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: docsData, refetch: refetchDocs } = useQuery({
    queryKey: ['documents', 'recent'],
    queryFn: () =>
      api
        .get<{ success: boolean; data: Document[]; pagination: { total: number } }>(
          '/documents?limit=5&page=1'
        )
        .then((r) => r.data),
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['logs', 'mine'],
    queryFn: () =>
      api.get<{ success: boolean; data: ActivityLog[] }>('/logs/mine').then((r) => r.data),
  });

  const totalDocs = docsData?.pagination?.total ?? 0;
  const recentDocs = docsData?.data ?? [];
  const logs = logsData?.data ?? [];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Welcome back, {user?.username}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Here's what's happening with your documents.
            </p>
          </div>
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm"
          >
            <Plus size={16} />
            Upload
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard icon={FileText} label="Total documents" value={totalDocs} />
          <StatCard
            icon={Users}
            label="Account type"
            value={user?.isPremium ? 'Premium' : 'Free'}
            sub={user?.isPremium ? 'Unlimited sharing' : 'Upgrade for more'}
          />
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
                <HardDrive size={20} />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Storage</p>
            </div>
            <StorageBar
              used={user?.storageUsed ?? 0}
              limit={user?.storageLimitBytes ?? 104857600}
            />
          </div>
        </div>

        {/* Recent docs + Activity feed */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Recent documents */}
          <div className="lg:col-span-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Recent Documents
              </h2>
              <Link to="/documents" className="text-sm text-brand-600 hover:underline font-medium">
                View all
              </Link>
            </div>
            {recentDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Upload className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No documents yet</p>
                <button
                  onClick={() => setUploadOpen(true)}
                  className="mt-3 text-sm text-brand-600 hover:underline font-medium"
                >
                  Upload your first document
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {recentDocs.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      to={`/documents/${doc.id}`}
                      className="flex items-center gap-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 -mx-2 px-2 rounded-lg transition-colors"
                    >
                      <FileText className="h-8 w-8 text-brand-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                          {doc.title}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Activity feed */}
          <div className="lg:col-span-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              Recent Activity
            </h2>
            <ActivityFeed logs={logs} isLoading={logsLoading} />
          </div>
        </div>
      </div>

      {/* Upload modal */}
      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Upload Document
              </h2>
              <button
                onClick={() => setUploadOpen(false)}
                className="rounded-full p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={18} />
              </button>
            </div>
            <DocumentUpload
              onSuccess={() => {
                setUploadOpen(false);
                refetchDocs();
              }}
            />
          </div>
        </div>
      )}
    </Layout>
  );
}
