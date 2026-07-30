import { useState, useRef, useEffect, type FC } from 'react';
import { Deck } from '../types';
import { createCard, saveAiSession } from '../db/queries';
import { createGroqClient, generateCardsFromText, cleanOCRText, extractTextFromImageGroq, getAiConfig, type GeneratedCard } from '../utils/groq';
import { extractTextFromDocx } from '../utils/docx';
import { chunkText } from '../utils/chunker';
import { Scan, FileText, Brain, Save, Loader2, AlertCircle, Upload, Check, Trash2, Wand2, File, Clock, Sparkles, Lock, Star } from 'lucide-react';
import { AIHistoryPanel } from './AIHistoryPanel';
import { isPremiumActive, type PremiumState } from '../utils/premium';

interface AIGeneratorScreenProps {
  decks: Deck[];
  onAddCard: (card: Parameters<typeof createCard>[0]) => void;
  onUpdateDeck?: (id: string, material: string) => Promise<void>;
  premiumState: PremiumState;
  onShowUpgrade: () => void;
}

export const AIGeneratorScreen: FC<AIGeneratorScreenProps> = ({ decks, onAddCard, onUpdateDeck, premiumState, onShowUpgrade }) => {
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [sourceText, setSourceText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<'connecting' | 'generating' | 'parsing' | 'chunk_done' | 'pacing'>('connecting');
  const [isCleaning, setIsCleaning] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [isDocxRunning, setIsDocxRunning] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);
  const [generatedTitle, setGeneratedTitle] = useState('');
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [saveResults, setSaveResults] = useState<{ success: number; failed: number } | null>(null);
  const [error, setError] = useState('');
  const [rawError, setRawError] = useState('');
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [cardGenProgress, setCardGenProgress] = useState(0);
  const [cardGenTarget, setCardGenTarget] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [chunkTotal, setChunkTotal] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);

  const tokenLogRef = useRef<Array<{ tokens: number; ts: number }>>([]);
  const accumulatedCardsRef = useRef<GeneratedCard[]>([]);

  /** Compute how many ms to wait before sending the next chunk so we stay
   *  within ~5000 tokens in the trailing 60s window (leaving 1000 margin
   *  from the 6000 TPM limit). Returns 0 if no wait is needed. */
  const computePacingDelay = (): number => {
    const now = Date.now();
    const WINDOW_MS = 60_000;
    const MAX_PER_WINDOW = 5000;
    const NEXT_ESTIMATE = 4500;

    tokenLogRef.current = tokenLogRef.current.filter(e => now - e.ts < WINDOW_MS);
    const totalUsed = tokenLogRef.current.reduce((s, e) => s + e.tokens, 0);

    if (MAX_PER_WINDOW - (totalUsed + NEXT_ESTIMATE) >= 0) return 0;

    const sorted = [...tokenLogRef.current].sort((a, b) => a.ts - b.ts);
    let simulated = totalUsed;
    for (const entry of sorted) {
      simulated -= entry.tokens;
      if (simulated + NEXT_ESTIMATE <= MAX_PER_WINDOW) {
        return Math.max((entry.ts + WINDOW_MS) - now + 1000, 1000);
      }
    }

    return 30_000;
  };

  const MAX_INPUT_CHARS = 10000;
  const aiConfig = getAiConfig();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!aiConfig) { setError('AI generation unavailable — API key not configured'); return; }
    setIsOcrRunning(true);
    setError('');

    try {
      const client = createGroqClient(aiConfig.apiKey, aiConfig.baseUrl);
      const text = await extractTextFromImageGroq(client, file);
      setSourceText(prev => prev + (prev ? '\n\n' : '') + text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR extraction failed');
    } finally {
      setIsOcrRunning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDocxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsDocxRunning(true);
    setError('');
    try {
      const text = await extractTextFromDocx(file);
      setSourceText(prev => prev + (prev ? '\n\n' : '') + text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Word document extraction failed');
    } finally {
      setIsDocxRunning(false);
      if (docxInputRef.current) docxInputRef.current.value = '';
    }
  };

  const handleCleanOCR = async () => {
    if (!sourceText.trim()) return;
    if (!aiConfig) { setError('AI generation unavailable — API key not configured'); return; }

    setIsCleaning(true);
    setError('');
    const originalText = sourceText;

    try {
      const client = createGroqClient(aiConfig.apiKey, aiConfig.baseUrl);
      const cleanedText = await cleanOCRText(client, originalText);
      setSourceText(cleanedText);

      await saveAiSession({ sessionType: 'clean', inputText: originalText, outputText: cleanedText });
      setHistoryRefresh(n => n + 1);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'AI cleaning failed');
    }

    setIsCleaning(false);
  };

  // Elapsed time ticker during generation
  useEffect(() => {
    if (!isProcessing) {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isProcessing]);

  const processChunk = async (
    chunkIdx: number,
    chunksArr: string[],
  ) => {
    setIsProcessing(true);
    setProcessingPhase('generating');
    setCardGenProgress(0);
    setCardGenTarget(0);
    setError('');

    // Proactive pacing: wait if the trailing 60s token window would overflow
    const pacingDelay = computePacingDelay();
    if (pacingDelay > 0) {
      setProcessingPhase('pacing');
      await new Promise(r => setTimeout(r, pacingDelay));
      setProcessingPhase('generating');
    }

    const client = createGroqClient(aiConfig!.apiKey, aiConfig!.baseUrl);
    const MAX_RETRIES = 2;

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      try {
        if (attempt > 1) {
          setProcessingPhase('generating');
          setError(`Retrying (attempt ${attempt}/${MAX_RETRIES + 1})...`);
          await new Promise(r => setTimeout(r, 1000));
        }

        const result = await generateCardsFromText(
          client,
          chunksArr[chunkIdx],
          undefined,
          (current, target) => {
            setCardGenProgress(current);
            setCardGenTarget(target);
          },
        );

        // Record token usage for the rolling window tracker
        if (result.estimatedTokensUsed > 0) {
          tokenLogRef.current.push({ tokens: result.estimatedTokensUsed, ts: Date.now() });
        }

        setProcessingPhase('parsing');
        await new Promise(r => setTimeout(r, 200));

        setGeneratedCards(prev => {
          const updated = [...prev, ...result.cards];
          accumulatedCardsRef.current = updated;
          return updated;
        });
        setGeneratedTitle(prev => prev || result.title || 'AI Generated Deck');

        if (chunkIdx + 1 < chunksArr.length) {
          setChunkIndex(chunkIdx + 2);
          await processChunk(chunkIdx + 1, chunksArr);
        } else {
          await finishGeneration();
        }
        return;
      } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err);

        if (/request too large|tokens per minute|tpm/i.test(errMsg)) {
          if (attempt < MAX_RETRIES + 1) {
            setProcessingPhase('generating');
            setError(`Rate limited — waiting 20s before retry (attempt ${attempt}/${MAX_RETRIES + 1})...`);
            await new Promise(r => setTimeout(r, 20000));
            continue;
          }
          setError(`Chunk ${chunkIdx + 1}/${chunksArr.length} rate-limited after ${MAX_RETRIES + 1} attempts. Click Generate to retry.`);
          let rawString = String(err);
          try {
            if (err?.error?.message) {
              rawString = JSON.stringify(err.error, null, 2);
            } else {
              rawString = JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
            }
          } catch (e) {}
          setRawError(rawString);
          setProcessingPhase('chunk_done');
          setIsProcessing(false);
          return;
        }

        if (attempt === MAX_RETRIES + 1) {
          setError(`Chunk ${chunkIdx + 1}/${chunksArr.length} failed after ${MAX_RETRIES + 1} attempts: ${errMsg}`);
          let rawString = String(err);
          try {
            if (err?.error?.message) {
              rawString = JSON.stringify(err.error, null, 2);
            } else {
              rawString = JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
            }
          } catch (e) {}
          setRawError(rawString);
          setProcessingPhase('chunk_done');
          setIsProcessing(false);
          return;
        }
      }
    }
  };

  const finishGeneration = async () => {
    setProcessingPhase('parsing');
    await new Promise(r => setTimeout(r, 200));

    const cards = accumulatedCardsRef.current;
    // Default to first deck only if no deck is selected yet
    setSelectedDeckId(prev => prev || decks[0]?.id || '');
    setStep('review');
    setSaveResults(null);
    setIsProcessing(false);

    await saveAiSession({
      sessionType: 'generate',
      inputText: sourceText.trim(),
      cardsJson: JSON.stringify(cards),
      cardCount: cards.length,
    });
    setHistoryRefresh(n => n + 1);
  };

  const handleGenerate = async () => {
    if (!sourceText.trim()) {
      setError('Please provide source text first');
      return;
    }
    if (!aiConfig) { setError('AI generation unavailable — API key not configured'); return; }

    const capturedText = sourceText.trim();
    const textChunks = capturedText.length > MAX_INPUT_CHARS
      ? chunkText(capturedText, 8000)
      : [capturedText];

    setChunkIndex(1);
    setChunkTotal(textChunks.length);
    setGeneratedCards([]);
    setGeneratedTitle('');
    setError('');
    setRawError('');

    await processChunk(0, textChunks);
  };

  const handleSaveAll = async () => {
    if (!selectedDeckId) {
      setError('Please select a target deck');
      return;
    }
    setSaveResults({ success: 0, failed: 0 });
    for (const card of generatedCards) {
      try {
        await onAddCard({
          deckId: selectedDeckId,
          cardType: 'basic',
          front: card.front,
          back: card.back,
          tag: card.tag,
          codeSnippet: card.codeSnippet,
        });
        setSaveResults(prev => prev ? { ...prev, success: prev.success + 1 } : prev);
      } catch {
        setSaveResults(prev => prev ? { ...prev, failed: prev.failed + 1 } : prev);
      }
    }
    
    if (onUpdateDeck && sourceText.trim()) {
      try {
        const targetDeck = decks.find(d => d.id === selectedDeckId);
        const existingMaterial = targetDeck?.studyMaterial || '';
        const newMaterial = existingMaterial 
          ? `${existingMaterial}\n\n---\n\n${sourceText.trim()}` 
          : sourceText.trim();
        await onUpdateDeck(selectedDeckId, newMaterial);
      } catch (e) {
        console.error('Failed to append study material:', e);
      }
    }
    // Save a generate session with deck info
    const targetDeck = decks.find(d => d.id === selectedDeckId);
    try {
      await saveAiSession({
        sessionType: 'generate',
        inputText: sourceText,
        cardsJson: JSON.stringify(generatedCards),
        cardCount: generatedCards.length,
        deckId: selectedDeckId,
        deckName: targetDeck?.name,
      });
      setHistoryRefresh(n => n + 1);
    } catch (e) {
      console.error('Failed to save generate session:', e);
    }
  };

  const updateCardTag = (index: number, tag: string) => {
    setGeneratedCards(prev => prev.map((c, i) => i === index ? { ...c, tag } : c));
  };

  const removeCard = (index: number) => {
    setGeneratedCards(prev => prev.filter((_, i) => i !== index));
  };

  const resetAll = () => {
    setStep('input');
    setSourceText('');
    setGeneratedCards([]);
    setGeneratedTitle('');
    setSaveResults(null);
    setError('');
    setChunkIndex(0);
    setChunkTotal(0);
    setProcessingPhase('connecting');
  };

  const handleRestoreClean = (_inputText: string, outputText: string) => {
    setStep('input');
    setSourceText(outputText);
    setSaveResults(null);
    setError('');
    setGeneratedCards([]);
  };

  const handleRestoreGenerate = (inputText: string, cards: GeneratedCard[], title: string) => {
    setStep('review');
    setSourceText(inputText);
    setGeneratedCards(cards);
    setGeneratedTitle(title);
    setSelectedDeckId(decks[0]?.id || '');
    setSaveResults(null);
    setError('');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="pb-3 border-b border-[#2D333B] flex items-center justify-between">
        <div>
          <span className="text-[9px] font-mono tracking-widest text-[#8B949E] font-bold">
            AI Flashcard Generator
          </span>
          <h2 className="text-sm font-bold text-white font-mono mt-0.5 flex items-center gap-1.5">
            <span>OCR + Groq AI</span>
            <span className="px-1 py-0.5 rounded bg-[#3FB950]/20 text-[#3FB950] text-[8px] font-bold font-mono uppercase tracking-wider leading-none">
              <Sparkles size={8} className="inline mr-0.5" />Premium
            </span>
          </h2>
        </div>
        {step === 'review' && (
          <button
            onClick={resetAll}
            className="px-2 py-1 text-[10px] font-mono font-bold tracking-wider text-[#8B949E] hover:text-white border border-[#30363D] rounded hover:bg-[#21262D] transition-colors cursor-pointer"
          >
            Generate More
          </button>
        )}
      </div>

      {/* History Panel */}
      <AIHistoryPanel
        refreshTrigger={historyRefresh}
        onRestoreClean={handleRestoreClean}
        onRestoreGenerate={handleRestoreGenerate}
      />

      {/* Premium gate: only paid users can generate AI cards */}
      {!isPremiumActive(premiumState) ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-4">
          <div className="w-14 h-14 rounded-full border-2 border-[#E3B341]/30 bg-[#E3B341]/10 flex items-center justify-center">
            <Lock size={24} className="text-[#E3B341]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white font-mono tracking-wider">
              Premium Feature
            </h3>
            <p className="text-[10px] font-mono text-[#8B949E] max-w-xs">
              AI flashcard generation is available exclusively for premium users. Create flashcards manually in the study tab, or upgrade to unlock AI-powered generation.
            </p>
          </div>
          <button
            onClick={onShowUpgrade}
            className="px-4 py-2 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-[11px] font-bold tracking-wider rounded transition-colors flex items-center space-x-2 cursor-pointer"
          >
            <Star size={13} />
            <span>Upgrade to Premium</span>
          </button>
          <p className="text-[9px] font-mono text-[#484F58]">
            Plans start at ₱99/month · Lifetime available
          </p>
        </div>
      ) : (
      <>
      {/* Step 1: Input */}
      {step === 'input' && (
        <div className="space-y-5">
          {/* Primary: Paste or type text */}
          <div className="p-5 rounded-lg border-2 border-[#E3B341]/15 bg-[#161B22] space-y-3">
            <div className="flex items-center space-x-2 text-[11px] font-mono font-semibold text-[#8B949E]">
              <FileText size={15} className="text-[#E3B341]" />
              <span>Paste or type text</span>
            </div>
            <div className="space-y-1">
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Paste your notes here."
                className="w-full h-32 px-3 py-2 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600 resize-none"
              />
              <div className="flex justify-between items-center mt-1">
                <span className="text-[9px] font-mono text-[#8B949E]">
                  AI reads this text and generates flashcards from it
                </span>
                <div className="flex items-center gap-2">
                  {sourceText.length > MAX_INPUT_CHARS && (
                    <span className="text-[8px] font-mono text-[#E3B341]">will be auto-chunked</span>
                  )}
                  <span className={`text-[9px] font-mono ${sourceText.length > MAX_INPUT_CHARS ? 'text-[#E3B341] font-bold' : 'text-[#8B949E]'}`}>
                    {sourceText.length.toLocaleString()} chars
                  </span>
                </div>
              </div>
            </div>
            {sourceText.trim() && (
              <button
                onClick={handleCleanOCR}
                disabled={isCleaning}
                className="w-full py-1.5 bg-[#21262D] hover:bg-[#30363D] disabled:opacity-50 text-white text-[10px] font-semibold tracking-wider rounded border border-[#30363D] transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                {isCleaning ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                <span>{isCleaning ? 'Cleaning text...' : 'Clean OCR garbage with AI'}</span>
              </button>
            )}
          </div>

          {/* Or divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#2D333B]" />
            <span className="text-[9px] font-mono text-[#484F58] font-semibold tracking-wider">or import from a file</span>
            <div className="flex-1 h-px bg-[#2D333B]" />
          </div>

          {/* Secondary: OCR + Word Upload */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* OCR Upload */}
            <div className="p-4 rounded border border-[#2D333B] bg-[#161B22] space-y-3">
              <div className="flex items-center space-x-2 text-[10px] font-mono font-semibold text-[#8B949E]">
                <Scan size={14} className="text-[#E3B341]" />
                <span>Vision OCR from image</span>
              </div>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center h-28 rounded border border-dashed border-[#30363D] bg-[#0D1117] hover:border-[#E3B341] transition-colors cursor-pointer"
              >
                {isOcrRunning ? (
                  <div className="text-center space-y-2">
                    <Loader2 size={20} className="animate-spin text-[#E3B341] mx-auto" />
                    <p className="text-[10px] font-mono text-[#8B949E]">
                      AI Vision OCR...
                    </p>
                  </div>
                ) : (
                  <>
                    <Upload size={20} className="text-[#8B949E]" />
                    <p className="text-[10px] font-mono text-[#8B949E] mt-1">
                      Groq Vision AI reads the image
                    </p>
                  </>
                )}
              </div>
              <span className="block text-[8px] font-mono text-[#484F58]">
                JPG, PNG up to 10MB
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>

            {/* Word Upload */}
            <div className="p-4 rounded border border-[#2D333B] bg-[#161B22] space-y-3">
              <div className="flex items-center space-x-2 text-[10px] font-mono font-semibold text-[#8B949E]">
                <File size={14} className="text-[#388BFD]" />
                <span>Upload Word file</span>
              </div>
              <div
                onClick={() => docxInputRef.current?.click()}
                className="flex flex-col items-center justify-center h-28 rounded border border-dashed border-[#30363D] bg-[#0D1117] hover:border-[#388BFD] transition-colors cursor-pointer"
              >
                {isDocxRunning ? (
                  <div className="text-center space-y-2">
                    <Loader2 size={20} className="animate-spin text-[#388BFD] mx-auto" />
                    <p className="text-[10px] font-mono text-[#8B949E]">Extracting...</p>
                  </div>
                ) : (
                  <>
                    <Upload size={20} className="text-[#8B949E]" />
                    <p className="text-[10px] font-mono text-[#8B949E] mt-1">Upload .docx</p>
                  </>
                )}
              </div>
              <span className="block text-[8px] font-mono text-[#484F58]">
                DOCX up to 10MB
              </span>
              <input
                ref={docxInputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleDocxUpload}
                className="hidden"
              />
            </div>
          </div>

          {isProcessing && (
            <div className="p-4 rounded border border-[#30363D] bg-[#161B22] space-y-3">
              {/* Phase indicator + elapsed */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {processingPhase === 'connecting' ? (
                    <div className="w-4 h-4 border-2 border-[#E3B341] border-t-transparent rounded-full animate-spin" />
                  ) : processingPhase === 'pacing' ? (
                    <Clock size={14} className="text-[#8B949E]" />
                  ) : (
                    <Loader2 size={14} className="animate-spin text-[#E3B341]" />
                  )}
                  <span className="text-[10px] font-mono font-bold text-[#E3B341] tracking-wider">
                    {processingPhase === 'connecting' && 'Connecting to AI...'}
                    {processingPhase === 'pacing' && `Pacing chunk ${chunkIndex}/${chunkTotal} — waiting to stay within API limits`}
                    {processingPhase === 'generating' && (
                      chunkTotal > 1
                        ? `Chunk ${chunkIndex}/${chunkTotal} · ${cardGenProgress}/${cardGenTarget || '?'} cards`
                        : `Generating (${cardGenProgress}/${cardGenTarget || '?'})`
                    )}
                    {processingPhase === 'parsing' && 'Finalizing cards...'}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-[#8B949E]">
                  {elapsedSeconds < 60 ? `${elapsedSeconds}s` : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`}
                </span>
              </div>

              {/* Progress bar + ETA */}
              {processingPhase === 'generating' && cardGenTarget > 0 && (
                <div className="space-y-2">
                  <div className="w-full h-2.5 rounded bg-[#0D1117] border border-[#30363D] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#E3B341] to-[#F0C24F] rounded transition-all duration-300 ease-out"
                      style={{ width: `${Math.min(100, (cardGenProgress / cardGenTarget) * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-mono">
                    {/* Cards progress */}
                    <div className="flex items-center space-x-3">
                      <span className="text-[#E3B341] font-bold">{cardGenProgress}</span>
                      <span className="text-[#484F58]">/</span>
                      <span className="text-[#8B949E]">{cardGenTarget} cards</span>
                    </div>
                    {/* ETA - calculate from actual speed: ~10s per card average */}
                    {cardGenProgress > 0 && cardGenProgress < cardGenTarget && (
                      <div className="text-[#8B949E]">
                        {(() => {
                          const avgPerCard = elapsedSeconds / cardGenProgress;
                          const remaining = Math.round(avgPerCard * (cardGenTarget - cardGenProgress));
                          if (remaining < 60) return <span>~{remaining}s remaining</span>;
                          return <span>~{Math.floor(remaining / 60)}m {remaining % 60}s remaining</span>;
                        })()}
                      </div>
                    )}
                  </div>
                  {/* Per-card pace hint */}
                  {cardGenProgress >= 2 && (
                    <div className="text-[8px] font-mono text-[#484F58] text-center">
                      ~{Math.round(elapsedSeconds / cardGenProgress)}s per card · generation may take several minutes for large sets
                    </div>
                  )}
                </div>
              )}

              {/* Animated dots when connecting / parsing */}
              {processingPhase !== 'generating' && (
                <div className="flex items-center justify-center py-2">
                  <div className="flex space-x-1">
                    <span className="w-1.5 h-1.5 bg-[#E3B341] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-[#E3B341] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-[#E3B341] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={isProcessing || !sourceText.trim()}
            className="w-full py-2.5 bg-[#E3B341] hover:bg-[#F0C24F] disabled:opacity-40 disabled:hover:bg-[#E3B341] text-[#0F1115] text-xs font-bold tracking-wider rounded transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>
                  {processingPhase === 'connecting' && 'Connecting to Groq AI...'}
                  {processingPhase === 'pacing' && `Pacing chunk ${chunkIndex}/${chunkTotal}...`}
                  {processingPhase === 'generating' && (chunkTotal > 1
                    ? `Chunk ${chunkIndex}/${chunkTotal} · ${cardGenProgress > 0 ? `${cardGenProgress} cards` : 'generating...'}`
                    : `Generating${cardGenProgress > 0 ? ` ${cardGenProgress} cards` : '...'}`
                  )}
                  {processingPhase === 'parsing' && 'Processing cards...'}
                </span>
              </>
            ) : (
              <>
                <Brain size={14} />
                <span>Generate flashcards with Groq AI</span>
              </>
            )}
          </button>

          {!sourceText.trim() && !isProcessing && (
            <p className="text-[9px] font-mono text-[#484F58] text-center -mt-2">
              Add text, an image, or a Word document above to get started
            </p>
          )}

          {error && (
            <div className="flex flex-col space-y-2 text-[#F85149] text-xs bg-[#F85149]/10 p-3 rounded border border-[#F85149]/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <AlertCircle size={14} />
                  <span className="font-bold">{error}</span>
                </div>
                {rawError && (
                  <button 
                    onClick={() => setShowErrorLog(!showErrorLog)}
                    className="px-2 py-1 bg-[#F85149]/20 hover:bg-[#F85149]/30 rounded text-[10px] font-mono cursor-pointer"
                  >
                    {showErrorLog ? 'Hide Details' : 'View Log'}
                  </button>
                )}
              </div>
              {showErrorLog && rawError && (
                <div className="mt-2 p-2 bg-[#0D1117] rounded border border-[#F85149]/30 overflow-x-auto">
                  <pre className="text-[10px] font-mono text-[#8B949E] whitespace-pre-wrap">
                    {rawError}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Review & Save */}
      {step === 'review' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 rounded border border-[#30363D] bg-[#161B22]">
            <div className="min-w-0 w-full sm:w-auto">
              <span className="text-[9px] sm:text-[10px] font-mono text-[#8B949E]">
                <span className="hidden xs:inline">Deck Title: </span><span className="text-white font-bold truncate">{generatedTitle}</span>
              </span>
              <span className="ml-2 sm:ml-3 text-[9px] sm:text-[10px] font-mono text-[#8B949E]">
                {generatedCards.length} cards
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="flex-grow sm:flex-grow-0 px-2 py-1 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-[9px] sm:text-[10px] font-mono focus:outline-none focus:border-[#E3B341] cursor-pointer"
              >
                <option value="">Select deck...</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <button
                onClick={handleSaveAll}
                disabled={!selectedDeckId}
                className="px-2.5 py-1 bg-[#3FB950] hover:bg-[#4ade80] disabled:bg-[#2D333B] disabled:text-[#484F58] text-[#0F1115] text-[9px] sm:text-[10px] font-bold tracking-wider rounded transition-colors flex items-center space-x-1 cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
              >
                <Save size={11} />
                <span>Save</span>
              </button>
            </div>
          </div>

          {saveResults && (
            <div className={`p-2 rounded border text-[10px] font-mono flex items-center space-x-2 ${
              saveResults.failed > 0
                ? 'border-[#E3B341]/30 bg-[#E3B341]/10 text-[#E3B341]'
                : 'border-[#3FB950]/30 bg-[#3FB950]/10 text-[#3FB950]'
            }`}>
              <Check size={12} />
              <span>{saveResults.success} saved, {saveResults.failed} failed</span>
            </div>
          )}

          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {generatedCards.map((card, idx) => (
              <div key={idx} className="p-3 rounded border border-[#2D333B] bg-[#161B22] hover:border-[#30363D] transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-grow space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono font-bold text-[#8B949E]">#{idx + 1}</span>
                      <input
                        type="text"
                        value={card.tag ?? ''}
                        onChange={(e) => updateCardTag(idx, e.target.value)}
                        placeholder="Enter topic tag..."
                        className="px-1.5 py-0.5 rounded border border-[#30363D] bg-[#0D1117] text-[#8B949E] text-[8px] font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600 w-24"
                      />
                    </div>
                    <p className="text-xs font-bold text-white font-mono leading-relaxed">{card.front}</p>
                    <p className="text-[11px] text-[#8B949E] font-mono leading-relaxed whitespace-pre-line">{card.back}</p>
                    {card.codeSnippet && (
                      <pre className="text-[10px] font-mono text-[#388BFD] bg-[#0D1117] p-2 rounded border border-[#30363D] overflow-x-auto">
                        {card.codeSnippet.code}
                      </pre>
                    )}
                  </div>
                  <button
                    onClick={() => removeCard(idx)}
                    className="p-1 hover:bg-[#F85149]/10 rounded text-[#8B949E] hover:text-[#F85149] transition-colors cursor-pointer flex-shrink-0"
                    title="Remove card"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>)}
    </div>
  );
};
