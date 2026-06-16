import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Upload,
  FileText,
  Download,
  Share2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import DocumentUpload from '../components/DocumentUpload';
import ShareModal from '../components/ShareModal';
import api from '../api/axios';
import type { Document, PaginatedResponse } from '../types';
import clsx from 'clsx';

const MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'text/plain': 'TXT',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default function Documents() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [mimeFilter, setMimeFilter] = useState('');
  const [sharedFilter, setSharedFilter] = useState<'' | 'owned' | 'shared'>('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<Document | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // 300ms debounce
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback(() => {
    const p: Record<string, string> = { page: String(page), limit: '10' };
    if (debouncedSearch) p.search = debouncedSearch;
    if (mimeFilter) p.mimeType = mimeFilter;
    return new URLSearchParams(p).toString();
  }, [page, debouncedSearch, mimeFilter]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['documents', page, debouncedSearch, mimeFilter],
    queryFn: () =>
      api
        .get<PaginatedResponse<Document>>(`/documents?${buildParams()}`)
        .then((r) => r.data),
  });

  const docs = data?.data ?? [];
  const pagination = data?.pagination;

  const handleDownload = async (doc: Document) => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.title;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  const handleDelete = async (doc: Document) => {
    setDeleting(doc.id);
    try {
      await api.delete(`/documents/${doc.id}`);
      toast.success('Document deleted');
      refetch();
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Documents</h1>
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Upload size={15} />
            Upload
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <select
            value={mimeFilter}
            onChange={(e) => { setMimeFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none"
          >
            <option value="">All types</option>
            {Object.entries(MIME_LABELS).map(([mime, label]) => (
              <option key={mime} value={mime}>{label}</option>
            ))}
          </select>
          <select
            value={sharedFilter}
            onChange={(e) => { setSharedFilter(e.target.value as typeof sharedFilter); setPage(1); }}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none"
          >
            <option value="">All</option>
            <option value="owned">My documents</option>
            <option value="shared">Shared with me</option>
          </select>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 animate-pulse">
                  <div className="h-9 w-9 rounded-lg bg-gray-200 dark:bg-gray-700" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {debouncedSearch ? 'No documents match your search' : 'No documents yet'}
              </p>
              {!debouncedSearch && (
                <button
                  onClick={() => setUploadOpen(true)}
                  className="mt-3 text-sm text-brand-600 hover:underline font-medium"
                >
                  Upload your first document
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className={clsx(
                    'flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors',
                    doc.isDeleted && 'opacity-50'
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-900/30">
                    <FileText className="h-5 w-5 text-brand-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/documents/${doc.id}`}
                      className="text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-brand-600 dark:hover:text-brand-400 truncate block"
                    >
                      {doc.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">
                        {MIME_LABELS[doc.mimeType] ?? doc.mimeType}
                      </span>
                      <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                      <span className="text-xs text-gray-400">{formatBytes(doc.sizeBytes)}</span>
                      <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                      <span className="text-xs text-gray-400">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDownload(doc)}
                      title="Download"
                      className="p-1.5 rounded-md text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                    >
                      <Download size={15} />
                    </button>
                    <button
                      onClick={() => setShareTarget(doc)}
                      title="Share"
                      className="p-1.5 rounded-md text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                    >
                      <Share2 size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(doc)}
                      disabled={deleting === doc.id}
                      title="Delete"
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {pagination.total} document{pagination.total !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
                Prev
              </button>
              <span className="text-sm text-gray-500">
                {page} / {pagination.pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                className="flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
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
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={18} />
              </button>
            </div>
            <DocumentUpload onSuccess={() => { setUploadOpen(false); refetch(); }} />
          </div>
        </div>
      )}

      {/* Share modal */}
      {shareTarget && (
        <ShareModal
          documentId={shareTarget.id}
          documentTitle={shareTarget.title}
          onClose={() => setShareTarget(null)}
        />
      )}
    </Layout>
  );
}
