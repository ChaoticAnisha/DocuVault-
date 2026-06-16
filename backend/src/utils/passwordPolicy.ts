import zxcvbn from 'zxcvbn';
import bcrypt from 'bcryptjs';

export interface PasswordStrengthResult {
  valid: boolean;
  errors: string[];
  score: number;
}

/**
 * Validates password against DocuVault's minimum requirements and runs zxcvbn
 * for a strength score. zxcvbn score: 0-1 weak, 2 fair, 3 good, 4 strong.
 * We require at least score 2 in addition to the rule checks.
 */
export const validatePasswordStrength = (password: string): PasswordStrengthResult => {
  const errors: string[] = [];

  if (password.length < 12) errors.push('Password must be at least 12 characters.');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter.');
  if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter.');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number.');
  if (!/[^A-Za-z0-9]/.test(password))
    errors.push('Password must contain at least one special character.');

  const { score } = zxcvbn(password);
  if (score < 2) errors.push('Password is too weak or too common.');

  return { valid: errors.length === 0, errors, score };
};

/**
 * Returns true if `newPassword` matches any of the last 5 hashed passwords in
 * `passwordHistory`. Uses bcrypt.compare so the comparison is timing-safe.
 */
export const isPasswordReused = async (
  newPassword: string,
  passwordHistory: string[]
): Promise<boolean> => {
  const recentHashes = passwordHistory.slice(-5);
  const checks = await Promise.all(
    recentHashes.map((hash) => bcrypt.compare(newPassword, hash))
  );
  return checks.some(Boolean);
};

/**
 * Returns true if the password was last changed more than 90 days ago.
 * A null `passwordChangedAt` means the password was set at account creation
 * and is treated as not expired (the 90-day window starts from first change).
 */
export const isPasswordExpired = (passwordChangedAt: Date | null): boolean => {
  if (!passwordChangedAt) return false;
  const daysSinceChange =
    (Date.now() - passwordChangedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceChange > 90;
};
