import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import AuthCard from '../components/ui/AuthCard';

type Step = 'qr' | 'verify' | 'backup';

interface SetupData {
  qrCode: string;
  backupCodes: string[];
}

export default function SetupMfa() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('qr');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [code, setCode] = useState('');
  const [savedCodes, setSavedCodes] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const startSetup = async () => {
    setIsLoading(true);
    try {
      const res = await api.post<{ success: boolean } & SetupData>('/auth/setup-mfa');
      setSetupData({ qrCode: res.data.qrCode, backupCodes: res.data.backupCodes });
      setStep('qr');
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Failed to start MFA setup'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async () => {
    if (code.length !== 6) return;
    setIsLoading(true);
    try {
      await api.post('/auth/verify-mfa-setup', { code });
      setStep('backup');
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Invalid code, please try again'
      );
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  // Initiate setup on first render
  if (!setupData && !isLoading) {
    startSetup();
  }

  if (!setupData) {
    return (
      <AuthCard title="Setting up MFA…">
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      </AuthCard>
    );
  }

  if (step === 'qr') {
    // The qrCode field is a data URL from the backend; parse the otpauth URI from it for QRCodeSVG.
    // If backend returned a data URL we render it as an <img>; if otpauth URI we use QRCodeSVG.
    const isDataUrl = setupData.qrCode.startsWith('data:');

    return (
      <AuthCard
        title="Set up authenticator"
        subtitle="Scan this QR code with Google Authenticator, Authy or similar"
      >
        <div className="space-y-6">
          <div className="flex justify-center">
            {isDataUrl ? (
              <img src={setupData.qrCode} alt="MFA QR code" className="w-48 h-48" />
            ) : (
              <QRCodeSVG value={setupData.qrCode} size={192} />
            )}
          </div>

          <button
            onClick={() => setStep('verify')}
            className="w-full py-2.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-colors"
          >
            I've scanned the code →
          </button>
        </div>
      </AuthCard>
    );
  }

  if (step === 'verify') {
    return (
      <AuthCard
        title="Verify your authenticator"
        subtitle="Enter the 6-digit code from your app to confirm setup"
      >
        <div className="space-y-5">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            autoFocus
            className="block w-full text-center text-3xl font-mono tracking-[0.5em] rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-200"
          />
          <button
            onClick={verifyCode}
            disabled={code.length !== 6 || isLoading}
            className="w-full py-2.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Enabling MFA…' : 'Enable MFA'}
          </button>
          <button
            onClick={() => setStep('qr')}
            className="w-full text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back
          </button>
        </div>
      </AuthCard>
    );
  }

  // step === 'backup'
  return (
    <AuthCard title="Save your backup codes" subtitle="Store these somewhere safe — you won't see them again">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-50 border border-gray-200 p-4">
          {setupData.backupCodes.map((c) => (
            <code key={c} className="font-mono text-sm text-gray-800 text-center py-1">
              {c}
            </code>
          ))}
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={savedCodes}
            onChange={(e) => setSavedCodes(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">
            I have saved these backup codes in a secure location
          </span>
        </label>

        <button
          disabled={!savedCodes}
          onClick={() => navigate('/settings/mfa', { replace: true })}
          className="w-full py-2.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          Done — MFA is enabled
        </button>
      </div>
    </AuthCard>
  );
}
