import { FileText, Upload, Shield, Settings, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-700">DocuVault</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button onClick={() => navigate('/settings/mfa')} className="p-2 rounded-lg hover:bg-gray-100">
            <Settings size={18} className="text-gray-500" />
          </button>
          <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-gray-100">
            <LogOut size={18} className="text-gray-500" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[
            { icon: FileText, label: 'Total Documents', value: '0' },
            { icon: Upload, label: 'Storage Used', value: '0 B' },
            { icon: Shield, label: 'Encrypted Files', value: '0' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
              <div className="p-3 bg-brand-50 rounded-lg">
                <Icon size={24} className="text-brand-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Recent Documents</h3>
            <button className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 transition-colors">
              <Upload size={16} /> Upload
            </button>
          </div>
          <p className="text-sm text-gray-500 text-center py-12">No documents yet.</p>
        </div>
      </main>
    </div>
  );
}
