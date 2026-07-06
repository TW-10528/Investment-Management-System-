import { useState } from 'react';
import toast from 'react-hot-toast';

interface AddFundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddFundModal({ isOpen, onClose, onSuccess }: AddFundModalProps) {
  const [tab, setTab] = useState<'upload' | 'manual'>('upload');
  const [loading, setLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    fundName: '',
    familyName: '',
    manager: '',
    strategy: '',
    currency: 'USD',
    commitmentUsd: '',
  });

  if (!isOpen) return null;

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error('Please select a PDF file');
      return;
    }
    setLoading(true);
    try {
      toast.success('PDF uploaded successfully');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error('Failed to upload PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async () => {
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

        <div className="flex border-b border-gray-200 px-6 pt-4">
          <button
            onClick={() => setTab('upload')}
            className={`pb-4 px-4 font-medium border-b-2 ${tab === 'upload' ? 'text-indigo-600 border-indigo-600' : 'text-gray-600 border-transparent'}`}
          >
            📤 Upload PDF
          </button>
          <button
            onClick={() => setTab('manual')}
            className={`pb-4 px-4 font-medium border-b-2 ${tab === 'manual' ? 'text-indigo-600 border-indigo-600' : 'text-gray-600 border-transparent'}`}
          >
            ✍️ Manual Entry
          </button>
        </div>

        <div className="p-6">
          {tab === 'upload' ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center"
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files[0]?.type === 'application/pdf') {
                    setUploadFile(e.dataTransfer.files[0]);
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
              >
                <p className="text-4xl mb-2">📄</p>
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files && setUploadFile(e.target.files[0])} id="pdf-input" />
                <label htmlFor="pdf-input" className="inline-block mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer">Browse</label>
              </div>
              {uploadFile && <div className="bg-green-50 border border-green-200 rounded p-2"><span className="text-sm text-green-800">✓ {uploadFile.name}</span></div>}
            </div>
          ) : (
            <div className="space-y-4">
              <input type="text" placeholder="Fund Name *" value={formData.fundName} onChange={(e) => setFormData({...formData, fundName: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <input type="text" placeholder="Fund Family *" value={formData.familyName} onChange={(e) => setFormData({...formData, familyName: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="Manager" value={formData.manager} onChange={(e) => setFormData({...formData, manager: e.target.value})} className="px-3 py-2 border border-gray-300 rounded-lg" />
                <input type="text" placeholder="Strategy" value={formData.strategy} onChange={(e) => setFormData({...formData, strategy: e.target.value})} className="px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <select value={formData.currency} onChange={(e) => setFormData({...formData, currency: e.target.value})} className="px-3 py-2 border border-gray-300 rounded-lg">
                  <option>USD</option>
                  <option>JPY</option>
                </select>
                <input type="number" placeholder="Commitment" value={formData.commitmentUsd} onChange={(e) => setFormData({...formData, commitmentUsd: e.target.value})} className="px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 border border-gray-300 rounded-lg">Cancel</button>
          <button onClick={tab === 'upload' ? handleUpload : handleManualSubmit} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            {loading ? 'Creating...' : 'Create Fund'}
          </button>
        </div>
      </div>
    </div>
  );
}
