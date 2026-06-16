export type Role = 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string | null;
  role: Role;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
  isPremium: boolean;
  storageUsed: number;
  storageLimitBytes: number;
  createdAt: string;
}

export interface Document {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  mimeType: string;
  sizeBytes: number;
  requiresSignature: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface LoginResponse {
  success: boolean;
  requiresMfa?: boolean;
  tempToken?: string;
  user?: User;
}

export interface ActivityLog {
  id: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  createdAt: string;
}

export interface DocumentShare {
  id: string;
  documentId: string;
  sharedWithId?: string;
  sharedWithEmail?: string;
  permission: 'VIEW' | 'SIGN' | 'EDIT';
  token: string;
  expiresAt?: string;
  isAccepted: boolean;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: Role;
  isPremium: boolean;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
  storageUsed: number;
  storageLimitBytes: number;
  lockedUntil?: string;
  createdAt: string;
}

export interface AdminStats {
  totalUsers: number;
  premiumUsers: number;
  totalDocuments: number;
  totalStorageUsed: string;
  recentLogs: ActivityLog[];
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
