import { useState, type FC } from 'react';
import { Deck } from '../types';
import { ArrowLeft, Edit3, Save, BookOpen, Play } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface StudyMaterialScreenProps {
  deck: Deck;
  onGoBack: () => void;
  onProceedToReview: () => void;
  onUpdateDeck: (deckId: string, studyMaterial: string) => Promise<void>;
}

export const StudyMaterialScreen: FC<StudyMaterialScreenProps> = ({
  deck,
  onGoBack,
  onProceedToReview,
  onUpdateDeck,
}) => {
  const [isEditing, setIsEditing] = useState(!deck.studyMaterial);
  const [material, setMaterial] = useState(deck.studyMaterial || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateDeck(deck.id, material);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save study material', err);
      alert('Failed to save study material.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3 border-b border-[#2D333B] pb-4">
        <div className="flex items-center space-x-3 min-w-0">
          <button
            onClick={onGoBack}
            className="p-1.5 text-[#8B949E] hover:text-white hover:bg-[#21262D] rounded transition-colors cursor-pointer flex-shrink-0"
            title="Go Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="text-[9px] sm:text-[10px] font-mono tracking-widest text-[#E3B341] uppercase font-bold">
                Study Material
              </span>
            </div>
            <h2 className="text-sm sm:text-lg font-bold text-white font-mono truncate">{deck.name}</h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-white text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase rounded border border-[#30363D] transition-colors cursor-pointer"
            >
              <Edit3 size={12} />
              <span className="hidden xs:inline">Edit Notes</span>
              <span className="xs:hidden">Edit</span>
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-[#3FB950] hover:bg-[#4ade80] text-[#0F1115] disabled:opacity-50 text-[10px] sm:text-[11px] font-bold tracking-wider uppercase rounded transition-colors cursor-pointer"
            >
              <Save size={12} />
              <span>{isSaving ? 'Saving...' : 'Save Notes'}</span>
            </button>
          )}

          <button
            onClick={onProceedToReview}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-[10px] sm:text-[11px] font-bold tracking-wider uppercase rounded transition-colors cursor-pointer"
          >
            <Play size={12} />
            <span className="hidden xs:inline">Start Flashcards</span>
            <span className="xs:hidden">Study</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-lg overflow-hidden min-h-[60vh] flex flex-col">
        {isEditing ? (
          <div className="flex-grow flex flex-col p-4 space-y-3">
            <div className="flex items-center space-x-2 text-[#8B949E] text-xs font-mono">
              <BookOpen size={14} />
              <span>Write your study notes here. Markdown is supported (e.g. **bold**, *italic*, `code`, # headings)</span>
            </div>
            <textarea
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder={`# Introduction to VLANs\n\nA VLAN is a logical broadcast domain that can span multiple physical LAN segments...`}
              className="flex-grow w-full bg-[#0D1117] border border-[#30363D] rounded p-4 text-[#E0E0E0] text-sm font-mono focus:outline-none focus:border-[#E3B341] resize-none"
            />
          </div>
        ) : material.trim() ? (
          <div className="p-6 prose prose-invert prose-sm md:prose-base max-w-none font-sans text-[#E0E0E0]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {material}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center p-8 space-y-4 text-center">
            <BookOpen size={48} className="text-[#8B949E] opacity-50" />
            <h3 className="text-lg font-bold text-white font-mono uppercase">No Study Material Added</h3>
            <p className="text-sm text-[#8B949E] max-w-md">
              You can paste your CCNA textbook notes, documentation, or study guides here so you can review them before doing your flashcards.
            </p>
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-[#21262D] hover:bg-[#30363D] text-white text-xs font-semibold uppercase tracking-wider rounded border border-[#30363D] transition-colors cursor-pointer"
            >
              Add Study Notes Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
