import { useState, useMemo, type FC } from 'react';
import { X, Upload, AlertCircle, Check, FileType } from 'lucide-react';

interface CsvRow {
  front: string;
  back: string;
  tag?: string;
}

interface CsvImportDialogProps {
  deckId: string;
  defaultTag: string;
  onImport: (rows: CsvRow[]) => Promise<number>;
  onClose: () => void;
}

function parseCsv(text: string): { rows: CsvRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const rows: CsvRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        if (inQuotes && line[j + 1] === '"') {
          current += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    const front = fields[0]?.replace(/^"|"$/g, '') || '';
    const back = fields[1]?.replace(/^"|"$/g, '') || '';
    const tag = fields[2]?.replace(/^"|"$/g, '') || '';

    if (!front && !back) {
      errors.push(`Line ${i + 1}: empty row skipped`);
      continue;
    }
    if (!front) {
      errors.push(`Line ${i + 1}: missing front/question — row skipped`);
      continue;
    }
    if (!back) {
      errors.push(`Line ${i + 1}: missing back/answer — row skipped`);
      continue;
    }

    rows.push({ front, back, tag: tag || undefined });
  }

  return { rows, errors };
}

export const CsvImportDialog: FC<CsvImportDialogProps> = ({ deckId, defaultTag, onImport, onClose }) => {
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);
  const [error, setError] = useState('');

  const parsed = useMemo(() => csvText.trim() ? parseCsv(csvText) : { rows: [], errors: [] }, [csvText]);

  const handleImport = async () => {
    if (parsed.rows.length === 0) return;
    setImporting(true);
    setError('');
    try {
      const success = await onImport(parsed.rows);
      setResult({ success, failed: parsed.rows.length - success });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-lg rounded border border-[#2D333B] bg-[#161B22] shadow-2xl space-y-4 animate-slide-up">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#2D333B]">
          <div className="flex items-center gap-2">
            <FileType size={16} className="text-[#E3B341]" />
            <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider">Import CSV</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[#30363D] rounded text-[#8B949E] hover:text-white transition-colors cursor-pointer">
            <X size={14} />
          </button>
        </div>

        {result ? (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex items-center gap-2 p-3 rounded border border-[#3FB950]/30 bg-[#3FB950]/5">
              <Check size={16} className="text-[#3FB950]" />
              <div>
                <p className="text-xs font-bold text-white font-mono">Import Complete</p>
                <p className="text-[10px] font-mono text-[#8B949E]">
                  {result.success} cards imported{result.failed > 0 ? `, ${result.failed} failed` : ''}
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-full py-2 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[#21262D] hover:bg-[#30363D] text-white border border-[#30363D] transition-colors cursor-pointer">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="px-4 text-[10px] font-mono text-[#8B949E] leading-relaxed space-y-1">
              <p>Paste CSV content below. The first two columns are used as <strong className="text-[#E0E0E0]">Front</strong> and <strong className="text-[#E0E0E0]">Back</strong>. A third column is used as <strong className="text-[#E0E0E0]">Tag</strong>.</p>
              <p>Supports quoted fields, commas inside quotes, and double-quote escaping.</p>
            </div>

            <div className="px-4">
              <textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={'front text,back text,tag (optional)'}
                className="w-full h-40 px-2.5 py-2 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600 resize-none"
                spellCheck={false}
              />
            </div>

            {parsed.rows.length > 0 && (
              <div className="px-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-mono font-bold text-[#8B949E] uppercase tracking-wider">
                    Preview — {parsed.rows.length} row{parsed.rows.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-[9px] font-mono text-[#8B949E]">First 3 shown</span>
                </div>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {parsed.rows.slice(0, 3).map((row, i) => (
                    <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-[#0D1117] border border-[#30363D] text-[9px] font-mono">
                      <span className="text-[#8B949E] w-4 flex-shrink-0">{i + 1}.</span>
                      <span className="text-[#E0E0E0] truncate min-w-0">{row.front}</span>
                      <span className="text-[#484F58]">→</span>
                      <span className="text-[#8B949E] truncate min-w-0">{row.back}</span>
                      {row.tag && <span className="px-1 py-0.5 rounded text-[7px] bg-[#0D1117] border border-[#30363D] text-[#8B949E]">{row.tag}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {parsed.errors.length > 0 && (
              <div className="px-4">
                <div className="p-2 rounded border border-[#F85149]/20 bg-[#F85149]/5 text-[10px] font-mono text-[#F85149] space-y-0.5">
                  {parsed.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              </div>
            )}

            {error && (
              <div className="px-4">
                <div className="flex items-center gap-1.5 p-2 rounded border border-[#F85149]/20 bg-[#F85149]/5 text-[10px] font-mono text-[#F85149]">
                  <AlertCircle size={12} />
                  <span>{error}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between px-4 pb-4">
              <span className="text-[9px] font-mono text-[#8B949E]">
                Tag: <strong className="text-[#E0E0E0]">{defaultTag}</strong>
              </span>
              <button onClick={handleImport}
                disabled={parsed.rows.length === 0 || importing}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] transition-colors cursor-pointer disabled:opacity-40">
                <Upload size={13} />
                {importing ? `Importing ${parsed.rows.length}...` : `Import ${parsed.rows.length} Cards`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export type { CsvRow };
