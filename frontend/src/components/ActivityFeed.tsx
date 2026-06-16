import { formatDistanceToNow } from 'date-fns';
import {
  Upload,
  Download,
  Share2,
  Trash2,
  LogIn,
  LogOut,
  User,
  FileText,
  Lock,
  Unlock,
  PenLine,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { ActivityLog } from '../types';

const ACTION_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  REGISTER: { icon: User, label: 'Registered account', color: 'text-green-500' },
  LOGIN: { icon: LogIn, label: 'Signed in', color: 'text-blue-500' },
  LOGOUT: { icon: LogOut, label: 'Signed out', color: 'text-gray-500' },
  UPLOAD_DOCUMENT: { icon: Upload, label: 'Uploaded document', color: 'text-brand-500' },
  DOWNLOAD_DOCUMENT: { icon: Download, label: 'Downloaded document', color: 'text-indigo-500' },
  DELETE_DOCUMENT: { icon: Trash2, label: 'Deleted document', color: 'text-red-500' },
  SHARE_DOCUMENT: { icon: Share2, label: 'Shared document', color: 'text-purple-500' },
  REVOKE_SHARE: { icon: Lock, label: 'Revoked share', color: 'text-orange-500' },
  SIGN_DOCUMENT: { icon: PenLine, label: 'Signed document', color: 'text-teal-500' },
  UPDATE_PROFILE: { icon: Settings, label: 'Updated profile', color: 'text-gray-500' },
  CHANGE_PASSWORD: { icon: Lock, label: 'Changed password', color: 'text-yellow-500' },
  ENABLE_MFA: { icon: ShieldCheck, label: 'Enabled 2FA', color: 'text-green-600' },
  DISABLE_MFA: { icon: Unlock, label: 'Disabled 2FA', color: 'text-red-500' },
  PASSWORD_RESET: { icon: Lock, label: 'Reset password', color: 'text-orange-500' },
  EXPORT_DATA: { icon: Download, label: 'Exported data', color: 'text-gray-500' },
};

interface Props {
  logs: ActivityLog[];
  isLoading?: boolean;
}

export default function ActivityFeed({ logs, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 animate-pulse">
            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!logs.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
        No activity yet.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {logs.map((log) => {
        const config = ACTION_CONFIG[log.action] ?? {
          icon: FileText,
          label: log.action.replace(/_/g, ' ').toLowerCase(),
          color: 'text-gray-500',
        };
        const Icon = config.icon;

        return (
          <li key={log.id} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 ${config.color}`}
            >
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-800 dark:text-gray-200 capitalize">
                {config.label}
              </p>
              {log.resourceType && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {log.resourceType}
                  {log.resourceId ? ` · ${log.resourceId.slice(0, 8)}…` : ''}
                </p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
