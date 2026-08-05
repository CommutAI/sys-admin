import { Brain, AlertTriangle, CheckCircle, XCircle, TrendingUp, Eye, Scan } from 'lucide-react';

const AIDashboard = () => {
  const passengerCounts = [
    { bus: 'ABC-1234', route: 'Route 1', yolo: 45, qr: 43, difference: 2, status: 'normal' },
    { bus: 'DEF-5678', route: 'Route 2', yolo: 38, qr: 32, difference: 6, status: 'warning' },
    { bus: 'GHI-9012', route: 'Route 3', yolo: 28, qr: 28, difference: 0, status: 'normal' },
    { bus: 'JKL-3456', route: 'Route 1', yolo: 15, qr: 15, difference: 0, status: 'normal' },
    { bus: 'MNO-7890', route: 'Route 4', yolo: 52, qr: 48, difference: 4, status: 'warning' },
  ];

  const anomalies = [
    { id: 1, type: 'Fake QR', bus: 'DEF-5678', message: 'Invalid QR pattern detected', time: '2 mins ago', severity: 'high' },
    { id: 2, type: 'No QR', bus: 'GHI-9012', message: '3 passengers boarded without scanning', time: '5 mins ago', severity: 'medium' },
    { id: 3, type: 'Duplicate Scan', bus: 'ABC-1234', message: 'Same QR scanned twice', time: '8 mins ago', severity: 'low' },
    { id: 4, type: 'Passenger Mismatch', bus: 'MNO-7890', message: 'YOLO count exceeds QR by 4', time: '12 mins ago', severity: 'medium' },
    { id: 5, type: 'Fake QR', bus: 'JKL-3456', message: 'Suspicious QR code pattern', time: '15 mins ago', severity: 'high' },
  ];

  const fareIrregularities = [
    { id: 1, type: 'Underpayment', bus: 'ABC-1234', amount: '$2.50', passenger: 'Unknown', time: '10 mins ago' },
    { id: 2, type: 'Overpayment', bus: 'DEF-5678', amount: '$1.00', passenger: 'QR-12345', time: '25 mins ago' },
    { id: 3, type: 'No Payment', bus: 'GHI-9012', amount: '$3.00', passenger: 'Unknown', time: '30 mins ago' },
    { id: 4, type: 'Underpayment', bus: 'MNO-7890', amount: '$0.50', passenger: 'QR-67890', time: '45 mins ago' },
  ];

  const stats = [
    { title: 'Total YOLO Count', value: '12,380', icon: Eye, color: 'bg-purple-500' },
    { title: 'Total QR Count', value: '12,250', icon: Scan, color: 'bg-blue-500' },
    { title: 'Difference', value: '130', icon: TrendingUp, color: 'bg-orange-500' },
    { title: 'Anomalies Detected', value: '23', icon: AlertTriangle, color: 'bg-red-500' },
  ];

  const severityColors = {
    high: 'bg-red-500/20 text-red-400 border-red-500/50',
    medium: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    low: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  };

  const statusColors = {
    normal: 'bg-green-500/20 text-green-400',
    warning: 'bg-yellow-500/20 text-yellow-400',
    critical: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-white text-3xl font-bold mb-2 flex items-center gap-3">
          <Brain className="text-orange-400" />
          AI Dashboard
        </h1>
        <p className="text-white/60">Real-time AI-powered passenger monitoring and anomaly detection</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="glass-card p-6">
              <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center mb-4`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <p className="text-white/60 text-sm mb-1">{stat.title}</p>
              <p className="text-white text-2xl font-bold">{stat.value}</p>
            </div>
          );
        })}
      </div>

      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4">Passenger Count Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-white/60 border-b border-white/10">
                <th className="pb-3 font-medium">Bus</th>
                <th className="pb-3 font-medium">Route</th>
                <th className="pb-3 font-medium">YOLO Count</th>
                <th className="pb-3 font-medium">QR Count</th>
                <th className="pb-3 font-medium">Difference</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {passengerCounts.map((count, index) => (
                <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-4 text-white">{count.bus}</td>
                  <td className="py-4 text-white/70">{count.route}</td>
                  <td className="py-4 text-white">{count.yolo}</td>
                  <td className="py-4 text-white">{count.qr}</td>
                  <td className="py-4">
                    <span className={`px-3 py-1 rounded-full text-xs ${count.difference > 5 ? 'bg-red-500/20 text-red-400' : count.difference > 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                      {count.difference > 0 ? `+${count.difference}` : count.difference}
                    </span>
                  </td>
                  <td className="py-4">
                    <span className={`px-3 py-1 rounded-full text-xs ${statusColors[count.status]}`}>
                      {count.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="text-orange-400" />
            Flagged Anomalies
          </h2>
          <div className="space-y-3">
            {anomalies.map((anomaly) => (
              <div key={anomaly.id} className={`p-4 rounded-xl border ${severityColors[anomaly.severity]}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-white font-medium">{anomaly.type}</p>
                    <p className="text-white/60 text-sm">{anomaly.bus}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${severityColors[anomaly.severity]}`}>
                    {anomaly.severity}
                  </span>
                </div>
                <p className="text-white/70 text-sm mb-2">{anomaly.message}</p>
                <p className="text-white/40 text-xs">{anomaly.time}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
            <XCircle className="text-orange-400" />
            Fare Irregularities
          </h2>
          <div className="space-y-3">
            {fareIrregularities.map((irregularity) => (
              <div key={irregularity.id} className="p-4 bg-white/5 rounded-xl">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-white font-medium">{irregularity.type}</p>
                    <p className="text-white/60 text-sm">{irregularity.bus}</p>
                  </div>
                  <span className="text-orange-400 font-bold">{irregularity.amount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-white/70 text-sm">Passenger: {irregularity.passenger}</p>
                  <p className="text-white/40 text-xs">{irregularity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4">Anomaly Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white/5 p-4 rounded-xl text-center">
            <p className="text-red-400 text-3xl font-bold">5</p>
            <p className="text-white/60 text-sm">Fake QR</p>
          </div>
          <div className="bg-white/5 p-4 rounded-xl text-center">
            <p className="text-orange-400 text-3xl font-bold">8</p>
            <p className="text-white/60 text-sm">No QR Scan</p>
          </div>
          <div className="bg-white/5 p-4 rounded-xl text-center">
            <p className="text-yellow-400 text-3xl font-bold">6</p>
            <p className="text-white/60 text-sm">Duplicate Scans</p>
          </div>
          <div className="bg-white/5 p-4 rounded-xl text-center">
            <p className="text-purple-400 text-3xl font-bold">4</p>
            <p className="text-white/60 text-sm">Passenger Mismatch</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIDashboard;
