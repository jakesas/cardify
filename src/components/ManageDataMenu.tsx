import { useState, type FC } from 'react';
import { MoreHorizontal, HardDrive, RotateCcw as RestoreIcon, Cloud, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';

interface ManageDataMenuProps {
  syncStatus: SyncStatus;
  onBackupNow: () => Promise<void>;
  onRestoreBackup: () => Promise<void>;
  onResetToDefaults: () => void;
}

function getSyncStatusIcon(status: SyncStatus) {
  switch (status) {
    case 'synced':
      return <Cloud className="text-[#3FB950]" size={14} />;
    case 'syncing':
      return <RefreshCw className="text-[#E3B341] animate-spin" size={14} />;
    case 'pending':
      return <CloudOff className="text-[#E3B341]" size={14} />;
    case 'offline':
      return <CloudOff className="text-[#8B949E]" size={14} />;
    case 'error':
      return <AlertTriangle className="text-[#F85149]" size={14} />;
    default:
      return <Cloud className="text-[#8B949E]" size={14} />;
  }
}

function getSyncStatusText(status: SyncStatus) {
  switch (status) {
    case 'synced':
      return 'Synced';
    case 'syncing':
      return 'Syncing...';
    case 'pending':
      return 'Pending';
    case 'offline':
      return 'Offline';
    case 'error':
      return 'Error';
    default:
      return 'Unknown';
  }
}

function getSyncStatusTitle(status: SyncStatus) {
  switch (status) {
    case 'synced':
      return 'All data synced to cloud';
    case 'syncing':
      return 'Syncing with cloud...';
    case 'pending':
      return 'Changes pending sync';
    case 'offline':
      return 'Offline - will sync when online';
    case 'error':
      return 'Sync error - check connection';
    default:
      return 'Unknown sync state';
  }
}

export const ManageDataMenu: FC<ManageDataMenuProps> = ({
  syncStatus,
  onBackupNow,
  onRestoreBackup,
  onResetToDefaults,
}) => {
  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setDataMenuOpen(open => !open)}
          className="flex items-center justify-center gap-1.5 px-1 h-8 text-[#8B949E] hover:text-white hover:bg-[#21262D] rounded-md transition-colors cursor-pointer"
          title="Manage data"
          aria-label="Manage data"
        >
          <MoreHorizontal size={15} />
          <span className="hidden sm:inline text-[10px] font-mono font-semibold uppercase tracking-wider">Manage data</span>
        </button>

        {dataMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setDataMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 w-52 p-2 rounded-lg border border-[#2D333B] bg-[#161B22] shadow-2xl overflow-hidden">
              {/* Sync status — informational, not interactive */}
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#0D1117] border border-[#2D333B]/60 text-[11px] font-mono text-[#8B949E] cursor-default select-none">
                {getSyncStatusIcon(syncStatus)}
                <span className="truncate" title={getSyncStatusTitle(syncStatus)}>
                  {getSyncStatusText(syncStatus)}
                </span>
              </div>

              <div className="h-px bg-[#2D333B] my-1.5" />

              <button
                onClick={() => { onBackupNow(); setDataMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-2 py-2.5 text-left text-[11px] font-mono text-[#8B949E] hover:text-white rounded-md hover:bg-[#21262D] transition-colors cursor-pointer"
                title="Backup all data now"
              >
                <HardDrive size={13} className="text-[#3FB950]" />
                <span>Backup now</span>
              </button>
              <button
                onClick={() => { onRestoreBackup(); setDataMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-2 py-2.5 text-left text-[11px] font-mono text-[#8B949E] hover:text-white rounded-md hover:bg-[#21262D] transition-colors cursor-pointer"
                title="Restore from last backup"
              >
                <RestoreIcon size={13} className="text-[#E3B341]" />
                <span>Restore</span>
              </button>

              {/* Destructive zone — visually separated */}
              <div className="h-px bg-[#2D333B] mt-2 mb-1" />

              <button
                onClick={() => { setDataMenuOpen(false); setResetConfirmText(''); setShowResetDialog(true); }}
                className="flex items-center gap-2 w-full px-2 py-2.5 text-left text-[11px] font-mono text-[#F85149] rounded-md hover:bg-[#F85149]/10 transition-colors cursor-pointer"
                title="Reset all data"
              >
                <AlertTriangle size={13} />
                <span>Flush & reset decks</span>
              </button>
            </div>
          </>
        )}
      </div>

      {showResetDialog && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#2D333B] rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-[#F85149] shrink-0" />
                <h3 className="text-sm font-bold text-white font-mono">Flush & reset decks</h3>
              </div>
              <p className="text-xs text-[#8B949E] leading-relaxed mb-4">
                This will erase all deck progress, cards, and statistics. This action cannot be undone.
                Type <span className="text-[#F85149] font-mono font-bold">RESET</span> to confirm.
              </p>
              <input
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && resetConfirmText.trim().toUpperCase() === 'RESET') {
                    onResetToDefaults();
                    setShowResetDialog(false);
                    setResetConfirmText('');
                  }
                }}
                placeholder="Type RESET to confirm"
                className="w-full px-3 py-2 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-sm font-mono focus:outline-none focus:border-[#F85149] placeholder-slate-600"
                autoFocus
              />
              <div className="flex justify-end space-x-2 pt-4">
                <button
                  onClick={() => { setShowResetDialog(false); setResetConfirmText(''); }}
                  className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#8B949E] hover:text-white rounded hover:bg-[#21262D] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { onResetToDefaults(); setShowResetDialog(false); setResetConfirmText(''); }}
                  disabled={resetConfirmText.trim().toUpperCase() !== 'RESET'}
                  className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#F85149] text-white hover:bg-[#FF6B62] rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Erase All Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
