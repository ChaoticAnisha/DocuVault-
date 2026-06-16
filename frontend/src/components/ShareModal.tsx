import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Copy, Check, Trash2, Link2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import type { DocumentShare } from '../types';

const schema = z.object({
  email: z.string().email('Valid email required'),
  permission: z.enum(['VIEW', 'SIGN', 'EDIT']),
  expiresIn: z.enum(['never', '1d', '7d', '30d']),
});
type FormValues = z.infer<typeof schema>;

const EXPIRY_LABELS: Record<string, string> = {
  never: 'Never',
  '1d': '1 day',
  '7d': '7 days',
  '30d': '30 days',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

interface Props {
  documentId: string;
  documentTitle: string;
  onClose: () => void;
}

export default function ShareModal({ documentId, documentTitle, onClose }: Props) {
  const qc = useQueryClient();

  const { data: sharesData } = useQuery({
    queryKey: ['shares', documentId],
    queryFn: () =>
      api
        .get<{ success: boolean; data: DocumentShare[] }>(`/documents/${documentId}/shares`)
        .then((r) => r.data),
  });

  const shares = sharesData?.data ?? [];

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { permission: 'VIEW', expiresIn: 'never' },
  });

  const shareMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const body: Record<string, unknown> = {
        email: values.email,
        permission: values.permission,
      };
      if (values.expiresIn !== 'never') {
        const days = parseInt(values.expiresIn);
        const d = new Date();
        d.setDate(d.getDate() + days);
        body.expiresAt = d.toISOString();
      }
      return api.post(`/documents/${documentId}/share`, body);
    },
    onSuccess: () => {
      toast.success('Document shared');
      reset();
      qc.invalidateQueries({ queryKey: ['shares', documentId] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to share';
      toast.error(msg);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (shareId: string) =>
      api.delete(`/documents/${documentId}/shares/${shareId}`),
    onSuccess: () => {
      toast.success('Share revoked');
      qc.invalidateQueries({ queryKey: ['shares', documentId] });
    },
  });

  const shareLink = (token: string) =>
    `${window.location.origin}/documents/shared/${token}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Share Document
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs mt-0.5">
              {documentTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Share form */}
          <form
            onSubmit={handleSubmit((v) => shareMutation.mutate(v))}
            className="space-y-3"
          >
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Email address
              </label>
              <input
                {...register('email')}
                type="email"
                placeholder="colleague@example.com"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              {errors.email && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle size={11} />
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Permission
                </label>
                <select
                  {...register('permission')}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none"
                >
                  <option value="VIEW">View</option>
                  <option value="SIGN">Sign</option>
                  <option value="EDIT">Edit</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Expires
                </label>
                <select
                  {...register('expiresIn')}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none"
                >
                  {Object.entries(EXPIRY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || shareMutation.isPending}
              className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {shareMutation.isPending ? 'Sharing…' : 'Share'}
            </button>
          </form>

          {/* Existing shares */}
          {shares.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                Shared with
              </h3>
              <ul className="space-y-2">
                {shares.map((share) => (
                  <li
                    key={share.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-gray-800 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {share.sharedWithEmail ?? 'Unknown'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">{share.permission}</span>
                        {share.expiresAt && (
                          <span className="text-xs text-gray-400">
                            · expires {new Date(share.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(shareLink(share.token));
                          toast.success('Link copied');
                        }}
                        title="Copy share link"
                        className="p-1.5 rounded-md text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                      >
                        <Link2 size={14} />
                      </button>
                      <button
                        onClick={() => revokeMutation.mutate(share.id)}
                        disabled={revokeMutation.isPending}
                        title="Revoke share"
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { CopyButton };
