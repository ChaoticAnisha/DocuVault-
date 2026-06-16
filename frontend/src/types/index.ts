export interface User {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  role: 'USER' | 'ADMIN';
  isVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

export interface Document {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  fileKey: string;
  mimeType: string;
  sizeBytes: number;
  isEncrypted: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}
