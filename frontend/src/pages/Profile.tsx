import { useAuthStore } from '../store/authStore';

export default function Profile() {
  const { user } = useAuthStore();
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 w-full max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Profile</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex gap-2"><dt className="text-gray-500 w-32">Username:</dt><dd className="font-medium">{user?.username}</dd></div>
          <div className="flex gap-2"><dt className="text-gray-500 w-32">Email:</dt><dd className="font-medium">{user?.email}</dd></div>
          <div className="flex gap-2"><dt className="text-gray-500 w-32">Role:</dt><dd className="font-medium">{user?.role}</dd></div>
          <div className="flex gap-2"><dt className="text-gray-500 w-32">Premium:</dt><dd className="font-medium">{user?.isPremium ? 'Yes' : 'No'}</dd></div>
          <div className="flex gap-2"><dt className="text-gray-500 w-32">MFA:</dt><dd className="font-medium">{user?.mfaEnabled ? 'Enabled' : 'Disabled'}</dd></div>
        </dl>
      </div>
    </div>
  );
}
