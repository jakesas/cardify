import { useState, useEffect, type FC } from 'react';
import { X, Share2, Check, Globe, AlertCircle, Loader2, Link as LinkIcon } from 'lucide-react';
import { uploadSharedDeck, type SharedDeckCard } from '../lib/community';
import type { Card } from '../types';

interface ShareDeckDialogProps {
  deckId: string;
  deckName: string;
  deckDescription: string;
  cards: Card[];
  userId: string | undefined;
  onClose: () => void;
}

export const ShareDeckDialog: FC<ShareDeckDialogProps> = ({
  deckId,
  deckName,
  deckDescription,
  cards,
  userId,
  onClose,
}) => {
  const [status, setStatus] = useState<'uploading' | 'ready' | 'error'>('uploading');
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    void (async () => {
      if (!userId) {
        setStatus('error');
        setErrorMsg('You must be logged in to share decks. Sign in via the account menu.');
        return;
      }

      const deckCards = cards.filter(c => c.deckId === deckId);
      if (deckCards.length === 0) {
        setStatus('error');
        setErrorMsg('This deck has no cards to share. Add some cards first.');
        return;
      }

      try {
        const sharedCards: SharedDeckCard[] = deckCards.map(c => ({
          front: c.front,
          back: c.back,
          tag: c.tag,
          cardType: c.cardType,
          codeSnippet: c.codeSnippet,
          topology: c.topology,
        }));

        const tags = [...new Set(deckCards.map(c => c.tag).filter(Boolean))] as string[];
        const result = await uploadSharedDeck(deckName, deckDescription, tags, sharedCards);

        if (!result.success || !result.data) {
          setStatus('error');
          setErrorMsg(result.error || 'Failed to upload deck. Check your connection and try again.');
          return;
        }

        const origin = window.location.origin;
        setShareUrl(`${origin}/?import=${result.data}`);
        setStatus('ready');
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    })();
  }, [deckId, deckName, deckDescription, cards, userId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select text manually
      const input = document.getElementById('share-url-input') as HTMLInputElement;
      if (input) {
        input.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    }
  };

  const handleShareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Flashcard Deck: ${deckName}`,
          text: `Study "${deckName}" with me on CCNA SRS!`,
          url: shareUrl,
        });
      } catch {
        // User cancelled or share failed — do nothing
      }
    } else {
      await handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-md rounded border border-[#2D333B] bg-[#161B22] p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2D333B] pb-2">
          <div className="flex items-center space-x-2">
            <Share2 size={14} className="text-[#E3B341]" />
            <h3 className="text-xs font-bold text-[#8B949E] font-mono uppercase tracking-wider">
              Share Deck
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#8B949E] hover:text-white p-1 hover:bg-[#21262D] rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Uploading */}
        {status === 'uploading' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <Loader2 size={28} className="text-[#E3B341] animate-spin" />
            <p className="text-xs font-mono text-[#8B949E]">Uploading deck to cloud...</p>
            <div className="w-48 h-1 bg-[#2D333B] rounded overflow-hidden">
              <div className="h-full bg-[#E3B341] rounded animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}

        {/* Ready — show link */}
        {status === 'ready' && (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 px-3 py-2 bg-[#3FB950]/10 border border-[#3FB950]/20 rounded">
              <Check size={14} className="text-[#3FB950] shrink-0" />
              <p className="text-[11px] text-[#3FB950] font-mono">
                Deck uploaded! Share this link with your classmates.
              </p>
            </div>

            {/* Share via native share sheet */}
            {'share' in navigator && (
              <button
                onClick={handleShareNative}
                className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-[11px] font-bold tracking-wider rounded transition-colors"
              >
                <Share2 size={14} />
                <span>Share via...</span>
              </button>
            )}

            {/* Link display + copy */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-[#8B949E] uppercase">
                Shareable Link
              </label>
              <div className="flex items-center space-x-2">
                <div className="flex-1 flex items-center space-x-1.5 px-2 py-1.5 bg-[#0D1117] border border-[#30363D] rounded text-xs font-mono text-[#E0E0E0] overflow-hidden">
                  <LinkIcon size={12} className="text-[#8B949E] shrink-0" />
                  <input
                    id="share-url-input"
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="flex-1 bg-transparent outline-none text-[11px] font-mono text-[#E0E0E0] truncate"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                </div>
                <button
                  onClick={handleCopy}
                  className={`flex items-center justify-center min-w-[36px] min-h-[36px] rounded text-[10px] font-bold tracking-wider transition-all cursor-pointer ${
                    copied
                      ? 'bg-[#3FB950] text-white'
                      : 'bg-[#21262D] text-[#8B949E] hover:text-white hover:bg-[#30363D] border border-[#30363D]'
                  }`}
                  title="Copy link"
                >
                  {copied ? <Check size={14} /> : <LinkIcon size={14} />}
                </button>
              </div>
            </div>

            <p className="text-[10px] text-[#8B949E] font-mono leading-relaxed">
              Anyone with this link can import your deck into their own study library.
            </p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="flex flex-col items-center space-y-3 py-4">
            <div className="flex items-center space-x-2 px-3 py-2 bg-[#F85149]/10 border border-[#F85149]/20 rounded w-full">
              <AlertCircle size={14} className="text-[#F85149] shrink-0" />
              <p className="text-[11px] text-[#F85149] font-mono">{errorMsg}</p>
            </div>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-[#8B949E] hover:text-white rounded hover:bg-[#21262D] transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* Footer for ready state */}
        {status === 'ready' && (
          <div className="flex justify-end space-x-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#8B949E] hover:text-white rounded hover:bg-[#21262D] transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
