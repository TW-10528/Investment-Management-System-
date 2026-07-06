import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line,
} from 'recharts';

interface ChartsGridProps {
  funds?: any[];
}

export function ChartsGrid({ funds = [] }: ChartsGridProps) {
  // Prepare bar chart data: Commitment, Contribution, Distribution
  const barChartData = funds.slice(0, 8).map(f => ({
    name: f.fund_name?.split(' ').slice(0, 2).join(' ') || f.fund_name,
    commitment: f.commitment_usd || 0,
    contribution: f.total_called_usd || 0,
    distribution: f.total_received_usd || 0,
  }));

  // Prepare pie chart data: Fund allocation
  const pieChartData = funds.slice(0, 8).map((f, idx) => ({
    name: f.fund_name?.split(' ').slice(0, 2).join(' ') || f.fund_name,
    value: f.total_called_usd || 0,
    color: ['#1e40af', '#047857', '#0f766e', '#b45309', '#475569', '#1d4ed8', '#4d7c0f', '#9f1239'][idx % 8],
  }));

  // SDG allocation (single fund, show commitment vs called)
  const sdgFund = funds.find(f => /sdg/i.test(f.fund_name ?? ''));
  const sdgPieData = sdgFund ? [
    { name: 'Commitment', value: sdgFund.commitment_usd || sdgFund.commitment_jpy || 0, color: '#1e40af' },
    { name: 'Called', value: sdgFund.total_called_usd || 0, color: '#047857' },
  ] : [];

  // Timeline data: Capital calls, returns, distribution over time (simplified)
  const timelineData = [
    { date: 'Q1 2024', calls: 5000000, returns: 2000000, distribution: 1500000 },
    { date: 'Q2 2024', calls: 8000000, returns: 2500000, distribution: 2000000 },
    { date: 'Q3 2024', calls: 12000000, returns: 3500000, distribution: 2500000 },
    { date: 'Q4 2024', calls: 15000000, returns: 4500000, distribution: 3000000 },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      {/* Bar Chart */}
      <div className="theme-card rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Commitment vs Contribution vs Distribution</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                background: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
              formatter={(value: any) => [`$${(value / 1000000).toFixed(1)}M`, '']}
            />
            <Legend />
            <Bar dataKey="commitment" fill="#1e40af" />
            <Bar dataKey="contribution" fill="#047857" />
            <Bar dataKey="distribution" fill="#0f766e" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie Chart - Fund Allocation */}
      <div className="theme-card rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Fund Allocation (USD)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={pieChartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={(props: any) => `${props.name} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {pieChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any) => `$${(value / 1000000).toFixed(1)}M`}
              contentStyle={{
                background: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Pie Chart - SDG Allocation */}
      <div className="theme-card rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">SDG Fund Allocation (JPY)</h3>
        <ResponsiveContainer width="100%" height={300}>
          {sdgPieData.length > 0 ? (
            <PieChart>
              <Pie
                data={sdgPieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(props: any) => `${props.name} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {sdgPieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any) => `¥${(value / 1000000000).toFixed(1)}B`}
                contentStyle={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              />
            </PieChart>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              No SDG data available
            </div>
          )}
        </ResponsiveContainer>
      </div>

      {/* Line Chart - Timeline */}
      <div className="theme-card rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Capital Calls, Returns & Distributions Over Time</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={timelineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                background: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
              formatter={(value: any) => `$${(value / 1000000).toFixed(1)}M`}
            />
            <Legend />
            <Line type="monotone" dataKey="calls" stroke="#1e40af" strokeWidth={2} dot={{ fill: '#1e40af' }} />
            <Line type="monotone" dataKey="returns" stroke="#047857" strokeWidth={2} dot={{ fill: '#047857' }} />
            <Line type="monotone" dataKey="distribution" stroke="#0f766e" strokeWidth={2} dot={{ fill: '#0f766e' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
