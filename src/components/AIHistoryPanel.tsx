import { useState, useEffect, type FC } from 'react';
import { listAiSessions, deleteAiSession, type AiSession } from '../db/queries';
import type { GeneratedCard } from '../utils/groq';
import { History, Trash2, RotateCcw, Wand2, Brain, ChevronDown, ChevronUp } from 'lucide-react';

interface AIHistoryPanelProps {
  onRestoreClean: (inputText: string, outputText: string) => void;
  onRestoreGenerate: (inputText: string, cards: GeneratedCard[], title: string) => void;
  refreshTrigger: number;
}

export const AIHistoryPanel: FC<AIHistoryPanelProps> = ({
  onRestoreClean,
  onRestoreGenerate,
  refreshTrigger,
}) => {
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    listAiSessions().then(setSessions).catch(console.error);
  }, [refreshTrigger]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteAiSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  const handleRestore = (session: AiSession) => {
    if (session.sessionType === 'clean') {
      onRestoreClean(session.inputText, session.outputText || session.inputText);
    } else {
      try {
        const cards: GeneratedCard[] = session.cardsJson ? JSON.parse(session.cardsJson) : [];
        onRestoreGenerate(session.inputText, cards, session.deckName || 'Restored Session');
      } catch {
        onRestoreGenerate(session.inputText, [], session.deckName || 'Restored Session');
      }
    }
    setIsOpen(false);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (sessions.length === 0) return null;

  return (
    <div className="rounded border border-[#30363D] bg-[#161B22] overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#21262D] transition-colors cursor-pointer"
      >
        <div className="flex items-center space-x-2">
          <History size={13} className="text-[#8B949E]" />
          <span className="text-[10px] font-mono font-bold text-[#8B949E] uppercase tracking-wider">
            AI Session History
          </span>
          <span className="px-1.5 py-0.5 bg-[#30363D] rounded text-[9px] font-mono text-[#E3B341] font-bold">
            {sessions.length}
          </span>
        </div>
        {isOpen ? <ChevronUp size={13} className="text-[#8B949E]" /> : <ChevronDown size={13} className="text-[#8B949E]" />}
      </button>

      {/* Session list */}
      {isOpen && (
        <div className="border-t border-[#30363D] max-h-[50vh] overflow-y-auto">
          {sessions.map(session => {
            const isExpanded = expandedId === session.id;
            return (
              <div key={session.id} className="border-b border-[#21262D] last:border-b-0">
                {/* Session row */}
                <div
                  className="flex items-center justify-between px-3 py-2 hover:bg-[#0D1117] cursor-pointer transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : session.id)}
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    {session.sessionType === 'clean' ? (
                      <Wand2 size={11} className="text-[#8B949E] shrink-0" />
                    ) : (
                      <Brain size={11} className="text-[#E3B341] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-white">
                          {session.sessionType === 'clean' ? 'OCR Clean' : `Generate · ${session.cardCount} cards`}
                        </span>
                        {session.deckName && (
                          <span className="text-[9px] font-mono text-[#388BFD] truncate max-w-[120px]">→ {session.deckName}</span>
                        )}
                      </div>
                      <p className="text-[9px] font-mono text-[#8B949E] truncate max-w-xs">
                        {session.inputText.slice(0, 80)}...
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0 ml-2">
                    <span className="text-[9px] font-mono text-[#8B949E] hidden sm:inline">{formatDate(session.createdAt)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRestore(session); }}
                      title="Restore this session"
                      className="p-1 rounded hover:bg-[#21262D] text-[#3FB950] hover:text-white transition-colors cursor-pointer"
                    >
                      <RotateCcw size={11} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(session.id, e)}
                      title="Delete session"
                      className="p-1 rounded hover:bg-[#F85149]/20 text-[#8B949E] hover:text-[#F85149] transition-colors cursor-pointer"
                    >
                      <Trash2 size={11} />
                    </button>
                    {isExpanded ? <ChevronUp size={11} className="text-[#8B949E]" /> : <ChevronDown size={11} className="text-[#8B949E]" />}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2 bg-[#0D1117]">
                    <div className="space-y-1">
                      <p className="text-[9px] font-mono font-bold text-[#8B949E] uppercase tracking-wider">Input Text</p>
                      <pre className="text-[10px] font-mono text-[#C9D1D9] whitespace-pre-wrap bg-[#161B22] border border-[#30363D] rounded p-2 max-h-32 overflow-y-auto">
                        {session.inputText}
                      </pre>
                    </div>

                    {session.sessionType === 'clean' && session.outputText && (
                      <div className="space-y-1">
                        <p className="text-[9px] font-mono font-bold text-[#8B949E] uppercase tracking-wider">Cleaned Output</p>
                        <pre className="text-[10px] font-mono text-[#3FB950] whitespace-pre-wrap bg-[#161B22] border border-[#3FB950]/20 rounded p-2 max-h-32 overflow-y-auto">
                          {session.outputText}
                        </pre>
                      </div>
                    )}

                    {session.sessionType === 'generate' && session.cardsJson && (
                      <div className="space-y-1">
                        <p className="text-[9px] font-mono font-bold text-[#8B949E] uppercase tracking-wider">Generated Cards ({session.cardCount})</p>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {(JSON.parse(session.cardsJson) as GeneratedCard[]).map((c, i) => (
                            <div key={i} className="bg-[#161B22] border border-[#30363D] rounded p-2">
                              <p className="text-[10px] font-mono text-[#E3B341] font-bold">Q: {c.front}</p>
                              <p className="text-[10px] font-mono text-[#8B949E] mt-0.5">A: {c.back.slice(0, 100)}{c.back.length > 100 ? '...' : ''}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => handleRestore(session)}
                      className="w-full py-1.5 mt-1 bg-[#21262D] hover:bg-[#30363D] text-white text-[10px] font-bold uppercase tracking-wider rounded border border-[#30363D] transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                    >
                      <RotateCcw size={11} />
                      <span>Restore This Session</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
