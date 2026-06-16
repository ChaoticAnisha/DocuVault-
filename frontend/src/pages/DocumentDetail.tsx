import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Download,
  Share2,
  Trash2,
  PenLine,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import ShareModal from '../components/ShareModal';
import api from '../api/axios';
import type { Document } from '../types';
import clsx from 'clsx';

const MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'Word Document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
  'image/jpeg': 'JPEG Image',
  'image/png': 'PNG Image',
  'image/webp': 'WebP Image',
  'text/plain': 'Plain Text',
  'application/vnd.ms-excel': 'Excel Spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function DeleteConfirmModal({
  title,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [typed, setTyped] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-600">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Delete document
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              This will permanently delete <strong className="text-gray-700 dark:text-gray-300">{title}</strong>. Type{' '}
              <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 text-xs font-mono">
                DELETE
              </code>{' '}
              to confirm.
            </p>
          </div>
        </div>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
          placeholder="Type DELETE"
        />
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={typed !== 'DELETE' || loading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['document', id],
    queryFn: () =>
      api
        .get<{ success: boolean; data: Document }>(`/documents/${id}`)
        .then((r) => r.data),
    enabled: !!id,
  });

  const doc = data?.data;

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/documents/${id}`),
    onSuccess: () => {
      toast.success('Document deleted');
      qc.invalidateQueries({ queryKey: ['documents'] });
      navigate('/documents');
    },
    onError: () => toast.error('Delete failed'),
  });

  const handleDownload = async () => {
    try {
      const res = await api.get(`/documents/${id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc?.title ?? 'document';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto animate-pulse space-y-4 pt-4">
          <div className="h-5 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        </div>
      </Layout>
    );
  }

  if (isError || !doc) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Document not found</p>
          <button
            onClick={() => navigate('/documents')}
            className="mt-3 text-sm text-brand-600 hover:underline"
          >
            Back to Documents
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back */}
        <button
          onClick={() => navigate('/documents')}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to Documents
        </button>

        {/* Card */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          {/* Header */}
          <div className="flex items-start gap-4 p-5 border-b border-gray-100 dark:border-gray-800">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-500">
              <FileText size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                {doc.title}
              </h1>
              {doc.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{doc.description}</p>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-gray-800">
            {[
              { label: 'Type', value: MIME_LABELS[doc.mimeType] ?? doc.mimeType },
              { label: 'Size', value: formatBytes(doc.sizeBytes) },
              { label: 'Uploaded', value: new Date(doc.createdAt).toLocaleDateString() },
              { label: 'Updated', value: new Date(doc.updatedAt).toLocaleDateString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white dark:bg-gray-900 p-4">
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  {label}
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-0.5">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Signature status */}
          {doc.requiresSignature && (
            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <PenLine size={15} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Signature Required
                </span>
                <span
                  className={clsx(
                    'ml-auto flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5',
                    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  )}
                >
                  <Clock size={11} />
                  Pending
                </span>
              </div>
            </div>
          )}

          {/* Deleted badge */}
          {doc.isDeleted && (
            <div className="px-5 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-100 dark:border-red-800 flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-500" />
              <span className="text-sm text-red-700 dark:text-red-400">This document has been deleted</span>
            </div>
          )}

          {/* Actions */}
          {!doc.isDeleted && (
            <div className="flex flex-wrap gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Download size={15} />
                Download
              </button>
              <button
                onClick={() => setShareOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Share2 size={15} />
                Share
              </button>
              {doc.requiresSignature && (
                <button
                  onClick={() => toast('Signature flow coming soon')}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
                >
                  <CheckCircle2 size={15} />
                  Sign
                </button>
              )}
              <button
                onClick={() => setDeleteOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-red-300 dark:border-red-700 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ml-auto"
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {shareOpen && (
        <ShareModal
          documentId={doc.id}
          documentTitle={doc.title}
          onClose={() => setShareOpen(false)}
        />
      )}

      {deleteOpen && (
        <DeleteConfirmModal
          title={doc.title}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </Layout>
  );
}
