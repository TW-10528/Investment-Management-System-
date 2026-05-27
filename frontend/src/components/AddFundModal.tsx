import React, { useState } from 'react';
import { fundsAPI } from '../services/api';
import toast from 'react-hot-toast';
import './AddFundModal.css';

interface AddFundModalProps {
  onClose: () => void;
  onSuccess: (success: boolean) => void;
}

const STRATEGIES = [
  'Buyout',
  'Growth',
  'Venture',
  'Secondaries',
  'Private Credit',
  'Real Estate',
  'Infrastructure',
];

export default function AddFundModal({ onClose, onSuccess }: AddFundModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fund_name: '',
    fund_name_jp: '',
    manager: '',
    administrator: '',
    strategy: '',
    vintage_year: String(new Date().getFullYear()),
    commitment_usd: '',
    entry_fx_rate: '',
    investment_period_start: '',
    investment_period_end: '',
    fund_term_years: '',
    management_fee_pct: '',
    carry_pct: '',
    hurdle_rate_pct: '',
    notes: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    
    if (!formData.fund_name || !formData.strategy) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      setLoading(true);
      const submitData = {
        ...formData,
        commitment_usd: formData.commitment_usd ? parseFloat(formData.commitment_usd) : 0,
        entry_fx_rate: formData.entry_fx_rate ? parseFloat(formData.entry_fx_rate) : null,
        vintage_year: formData.vintage_year ? parseInt(formData.vintage_year) : null,
        fund_term_years: formData.fund_term_years ? parseInt(formData.fund_term_years) : null,
        management_fee_pct: formData.management_fee_pct ? parseFloat(formData.management_fee_pct) : 0,
        carry_pct: formData.carry_pct ? parseFloat(formData.carry_pct) : 0,
        hurdle_rate_pct: formData.hurdle_rate_pct ? parseFloat(formData.hurdle_rate_pct) : 0,
      };

      await fundsAPI.create(submitData);
      toast.success('Fund created successfully!');
      onSuccess(true);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to create fund');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add New Fund</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="fund-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="fund_name">Fund Name *</label>
              <input
                id="fund_name"
                name="fund_name"
                type="text"
                value={formData.fund_name}
                onChange={handleChange}
                placeholder="e.g., Global Growth Fund"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="fund_name_jp">Fund Name (JP)</label>
              <input
                id="fund_name_jp"
                name="fund_name_jp"
                type="text"
                value={formData.fund_name_jp}
                onChange={handleChange}
                placeholder="Japanese name"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="strategy">Strategy *</label>
              <select
                id="strategy"
                name="strategy"
                value={formData.strategy}
                onChange={handleChange}
                required
              >
                <option value="">Select a strategy</option>
                {STRATEGIES.map((strat) => (
                  <option key={strat} value={strat}>{strat}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="vintage_year">Vintage Year</label>
              <input
                id="vintage_year"
                name="vintage_year"
                type="number"
                value={formData.vintage_year}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="manager">Manager</label>
              <input
                id="manager"
                name="manager"
                type="text"
                value={formData.manager}
                onChange={handleChange}
                placeholder="Fund manager name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="administrator">Administrator</label>
              <input
                id="administrator"
                name="administrator"
                type="text"
                value={formData.administrator}
                onChange={handleChange}
                placeholder="Fund administrator"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="commitment_usd">Commitment (USD)</label>
              <input
                id="commitment_usd"
                name="commitment_usd"
                type="number"
                step="0.01"
                value={formData.commitment_usd}
                onChange={handleChange}
                placeholder="0"
              />
            </div>
            <div className="form-group">
              <label htmlFor="entry_fx_rate">Entry FX Rate</label>
              <input
                id="entry_fx_rate"
                name="entry_fx_rate"
                type="number"
                step="0.0001"
                value={formData.entry_fx_rate}
                onChange={handleChange}
                placeholder="USD/JPY rate"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="investment_period_start">Investment Period Start</label>
              <input
                id="investment_period_start"
                name="investment_period_start"
                type="date"
                value={formData.investment_period_start}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="investment_period_end">Investment Period End</label>
              <input
                id="investment_period_end"
                name="investment_period_end"
                type="date"
                value={formData.investment_period_end}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="fund_term_years">Fund Term (Years)</label>
              <input
                id="fund_term_years"
                name="fund_term_years"
                type="number"
                value={formData.fund_term_years}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="management_fee_pct">Management Fee %</label>
              <input
                id="management_fee_pct"
                name="management_fee_pct"
                type="number"
                step="0.01"
                value={formData.management_fee_pct}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="carry_pct">Carry %</label>
              <input
                id="carry_pct"
                name="carry_pct"
                type="number"
                step="0.01"
                value={formData.carry_pct}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="hurdle_rate_pct">Hurdle Rate %</label>
              <input
                id="hurdle_rate_pct"
                name="hurdle_rate_pct"
                type="number"
                step="0.01"
                value={formData.hurdle_rate_pct}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Additional notes about the fund"
              rows={3}
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-submit"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Fund'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
