import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    ReferenceLine,
} from 'recharts';
import type { GridSnapshot } from '../types';

interface TelemetryChartProps {
    history: GridSnapshot[];
}

export function TelemetryChart({ history }: TelemetryChartProps) {
    return (
        <div style={{ width: '100%', height: 170 }}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                        dataKey="t"
                        tick={{ fontSize: 9, fill: '#64748b' }}
                        tickFormatter={(v: number) => `${Math.round(v)}s`}
                    />
                    <YAxis
                        tick={{ fontSize: 9, fill: '#64748b' }}
                        domain={['auto', 'auto']}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            fontSize: '11px',
                        }}
                        labelStyle={{ color: '#94a3b8' }}
                        labelFormatter={(v) => `${Number(v).toFixed(1)}s`}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }} />
                    <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
                    <Line type="monotone" dataKey="solarKw" name="Solar" stroke="#facc15" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="loadKw" name="Load" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="batteryKw" name="Battery" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
