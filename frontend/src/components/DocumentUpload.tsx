import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileText, Image, FileArchive, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import api from '../api/axios';
import clsx from 'clsx';

const ACCEPTED_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'text/plain': ['.txt'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

const MAX_SIZE = 50 * 1024 * 1024;

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  requiresSignature: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

function getMimeIcon(mime: string) {
  if (mime.startsWith('image/')) return Image;
  if (mime.includes('zip') || mime.includes('archive')) return FileArchive;
  return FileText;
}

interface Props {
  onSuccess?: () => void;
}

export default function DocumentUpload({ onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onDrop = useCallback((accepted: File[], rejected: { errors: readonly { message: string }[] }[]) => {
    if (rejected.length > 0) {
      const reason = rejected[0]?.errors[0]?.message ?? 'File not accepted';
      toast.error(reason);
      return;
    }
    if (accepted[0]) {
      setFile(accepted[0]);
      setDone(false);
      setProgress(0);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME_TYPES,
    maxSize: MAX_SIZE,
    maxFiles: 1,
  });

  const submit = handleSubmit(async (values) => {
    if (!file) { toast.error('Please select a file'); return; }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', values.title);
    if (values.description) formData.append('description', values.description);
    if (values.requiresSignature) formData.append('requiresSignature', 'true');

    setUploading(true);
    setProgress(0);

    try {
      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      setDone(true);
      toast.success('Document uploaded successfully');
      reset();
      setFile(null);
      onSuccess?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  });

  const sizeStr =
    file
      ? file.size >= 1024 * 1024
        ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`
      : '';

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={clsx(
          'relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          isDragActive
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
            : 'border-gray-300 dark:border-gray-700 hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
        )}
      >
        <input {...getInputProps()} />
        {file ? (
          <div className="flex flex-col items-center gap-2 w-full">
            <div className="flex items-center gap-3 w-full max-w-sm">
              {(() => {
                const Icon = getMimeIcon(file.type);
                return <Icon className="h-10 w-10 text-brand-500 shrink-0" />;
              })()}
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-gray-500">{sizeStr}</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); setProgress(0); }}
                className="rounded-full p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <X size={14} />
              </button>
            </div>
            {uploading && (
              <div className="w-full max-w-sm">
                <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full bg-brand-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1 text-right">{progress}%</p>
              </div>
            )}
            {done && (
              <div className="flex items-center gap-1 text-green-600 text-sm">
                <CheckCircle2 size={14} />
                Uploaded
              </div>
            )}
          </div>
        ) : (
          <>
            <Upload className="h-10 w-10 text-gray-400 mb-3" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {isDragActive ? 'Drop file here' : 'Drag & drop or click to select'}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              PDF, Word, Excel, images, plain text · Max 50 MB
            </p>
          </>
        )}
      </div>

      {/* Metadata */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          {...register('title')}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="Document title"
        />
        {errors.title && (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle size={12} />
            {errors.title.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Description
        </label>
        <textarea
          {...register('description')}
          rows={2}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
          placeholder="Optional description"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          {...register('requiresSignature')}
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">Requires signature</span>
      </label>

      <button
        type="submit"
        disabled={uploading || !file}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? `Uploading… ${progress}%` : 'Upload Document'}
      </button>
    </form>
  );
}
