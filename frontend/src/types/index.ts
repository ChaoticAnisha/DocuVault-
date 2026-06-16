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
