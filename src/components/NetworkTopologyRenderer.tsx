
import { type FC } from 'react';
import { NetworkTopology, NetworkTopologyNode } from '../types';
import { PcCase, HardDrive, Cpu, Cloud, ShieldAlert } from 'lucide-react';

interface NetworkTopologyRendererProps {
  topology: NetworkTopology;
  className?: string;
}

export const NetworkTopologyRenderer: FC<NetworkTopologyRendererProps> = ({
  topology,
  className = '',
}) => {
  // Simple helper to render node icons
  const renderNodeIcon = (type: NetworkTopologyNode['type'], isDark: boolean) => {
    const iconSize = 22;
    const baseColor = isDark ? 'text-cyan-400' : 'text-cyan-600';

    switch (type) {
      case 'router':
        return (
          <div className="relative flex items-center justify-center w-12 h-12 rounded-full border border-cyan-500/40 bg-slate-900/90 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
            {/* Custom routing-symbol look */}
            <Cpu size={iconSize} className={baseColor} />
            <div className="absolute inset-0 border border-dashed border-cyan-400/20 rounded-full animate-spin-slow"></div>
          </div>
        );
      case 'switch':
        return (
          <div className="relative flex items-center justify-center w-14 h-8 rounded-md border border-sky-500/40 bg-slate-900/90 shadow-[0_0_12px_rgba(14,165,233,0.15)]">
            <HardDrive size={iconSize} className="text-sky-400" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
        );
      case 'host':
        return (
          <div className="flex items-center justify-center w-10 h-10 rounded bg-slate-800 border border-slate-700">
            <PcCase size={20} className="text-slate-400" />
          </div>
        );
      case 'cloud':
        return (
          <div className="flex items-center justify-center w-12 h-10 rounded-full bg-blue-900/30 border border-blue-500/30">
            <Cloud size={20} className="text-blue-400" />
          </div>
        );
      case 'firewall':
        return (
          <div className="flex items-center justify-center w-10 h-10 rounded bg-red-950/40 border border-red-500/30">
            <ShieldAlert size={20} className="text-red-400" />
          </div>
        );
      default:
        return <PcCase size={20} className="text-slate-400" />;
    }
  };

  return (
    <div className={`relative w-full overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/70 p-4 ${className}`} style={{ height: '240px' }}>
      {/* Background technical layout details */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40"></div>
      
      {/* Topology Label */}
      <div className="absolute top-2.5 left-3 z-10 flex items-center space-x-2">
        <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
        <span className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">Interactive Lab Topology</span>
      </div>

      <svg className="absolute inset-0 w-full h-full z-0 pointer-events-none">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 2 L 8 5 L 0 8 z" fill="#475569" />
          </marker>
        </defs>

        {/* Draw Links/Connections */}
        {topology.links.map((link, idx) => {
          const fromNode = topology.nodes.find((n) => n.id === link.from);
          const toNode = topology.nodes.find((n) => n.id === link.to);

          if (!fromNode || !toNode) return null;

          const midX = (fromNode.x + toNode.x) / 2;
          const midY = (fromNode.y + toNode.y) / 2;

          const isSerial = link.type === 'serial';
          const isBlocked = link.label?.toLowerCase().includes('blocked');

          return (
            <g key={`link-${idx}`}>
              <line
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                stroke={isBlocked ? '#f43f5e' : isSerial ? '#f59e0b' : '#334155'}
                strokeWidth={isSerial ? '2.5' : '1.5'}
                strokeDasharray={isBlocked ? '4,4' : isSerial ? '8,4' : undefined}
                className="transition-all duration-300"
              />
              {/* Link Label (Port IDs or cost) */}
              {link.label && (
                <g transform={`translate(${midX}, ${midY - 8})`}>
                  <rect
                    x={-45}
                    y={-8}
                    width={90}
                    height={15}
                    rx={3}
                    fill="#020617"
                    fillOpacity={0.85}
                    stroke="#1e293b"
                    strokeWidth={0.5}
                  />
                  <text
                    textAnchor="middle"
                    fill={isBlocked ? '#fb7185' : '#94a3b8'}
                    fontSize="9"
                    fontFamily="monospace"
                    className="select-none"
                  >
                    {link.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Draw Nodes */}
      {topology.nodes.map((node) => {
        // Render node HTML overlays positioned absolutely on top of the SVG background
        return (
          <div
            key={node.id}
            className="absolute flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2 cursor-default group"
            style={{ left: `${node.x}px`, top: `${node.y}px` }}
          >
            {/* Dynamic Node Wrapper */}
            <div className="relative transition-transform duration-300 group-hover:scale-105">
              {renderNodeIcon(node.type, true)}
            </div>

            {/* Node Label Text */}
            <div className="mt-1 px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-800/80 shadow-md">
              <span className="text-[10px] font-mono leading-none text-slate-300 text-center block whitespace-pre-line">
                {node.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
