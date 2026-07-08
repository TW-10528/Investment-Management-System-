import { useState } from 'react';
import toast from 'react-hot-toast';

interface AddFundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddFundModal({ isOpen, onClose, onSuccess }: AddFundModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fundName: '',
    familyName: '',
    manager: '',
    strategy: '',
    currency: 'USD',
    commitmentUsd: '',
  });

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!formData.fundName || !formData.familyName) {
      toast.error('Fund name and family name required');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/v1/fund-families/add-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error('Failed to create fund');
      toast.success('Fund created successfully');
      onSuccess();
      onClose();
      setFormData({ fundName: '', familyName: '', manager: '', strategy: '', currency: 'USD', commitmentUsd: '' });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create fund');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">Add New Fund</h2>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-600">×</button>
        </div>

        <div className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Fund Name *</label>
              <input
                type="text"
                value={formData.fundName}
                onChange={(e) => setFormData({...formData, fundName: e.target.value})}
                placeholder="e.g., Dover Street XII"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Fund Family *</label>
              <input
                type="text"
                value={formData.familyName}
                onChange={(e) => setFormData({...formData, familyName: e.target.value})}
                placeholder="e.g., Dover Street"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Manager</label>
                <input
                  type="text"
                  value={formData.manager}
                  onChange={(e) => setFormData({...formData, manager: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Strategy</label>
                <input
                  type="text"
                  value={formData.strategy}
                  onChange={(e) => setFormData({...formData, strategy: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Currency</label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({...formData, currency: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="USD">USD</option>
                  <option value="JPY">JPY</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Commitment</label>
                <input
                  type="number"
                  value={formData.commitmentUsd}
                  onChange={(e) => setFormData({...formData, commitmentUsd: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Fund'}
          </button>
        </div>
      </div>
    </div>
  );
}
