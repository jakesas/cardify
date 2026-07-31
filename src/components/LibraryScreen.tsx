import { useState, useEffect, useMemo, useRef, type FC } from 'react';
import { Deck } from '../types';
import {
  listLibraryResources,
  getLibraryResource,
  uploadLibraryResource,
  incrementResourceViews,
  incrementResourceImports,
  deleteLibraryResource,
  type LibraryResourceMeta,
  type LibraryResource,
} from '../lib/library';
import { DEMO_LIBRARY_RESOURCES } from '../data/demoLibrary';
import { extractTextFromDocx } from '../utils/docx';
import { extractTextFromPdf } from '../utils/pdfExtract';
import {
  BookOpen, Search, Upload, Download, Eye, FileText, Plus, Trash2, ArrowLeft,
  Sparkles, Clock, Tag, Check, AlertCircle, Loader2, File, ChevronRight,
  BookmarkPlus, FolderPlus, Layers, ShieldCheck, Zap, Globe, HardDrive,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface LibraryScreenProps {
  decks: Deck[];
  userId?: string;
  userName?: string;
  onImportToDeck: (deckId: string, studyMaterial: string) => Promise<void>;
  onOpenAiGeneratorWithText?: (text: string) => void;
}

const SUBJECT_THEMES: Record<string, { bg: string; text: string; border: string; iconColor: string }> = {
  Networking: { bg: 'rgba(227, 179, 65, 0.12)', text: '#E3B341', border: 'rgba(227, 179, 65, 0.3)', iconColor: '#E3B341' },
  Routing: { bg: 'rgba(56, 139, 253, 0.12)', text: '#58A6FF', border: 'rgba(56, 139, 253, 0.3)', iconColor: '#58A6FF' },
  Security: { bg: 'rgba(248, 81, 73, 0.12)', text: '#F85149', border: 'rgba(248, 81, 73, 0.3)', iconColor: '#F85149' },
  Hardware: { bg: 'rgba(163, 113, 247, 0.12)', text: '#BC8CFF', border: 'rgba(163, 113, 247, 0.3)', iconColor: '#BC8CFF' },
  General: { bg: 'rgba(63, 185, 80, 0.12)', text: '#3FB950', border: 'rgba(63, 185, 80, 0.3)', iconColor: '#3FB950' },
};

function getSubjectTheme(subject: string) {
  return SUBJECT_THEMES[subject] || SUBJECT_THEMES.General;
}

export const LibraryScreen: FC<LibraryScreenProps> = ({
  decks,
  userId,
  userName,
  onImportToDeck,
  onOpenAiGeneratorWithText,
}) => {
  const [resources, setResources] = useState<LibraryResourceMeta[]>([]);
  const [useFirestore, setUseFirestore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'views' | 'newest' | 'imports'>('views');

  // Active Reader Modal
  const [activeResource, setActiveResource] = useState<LibraryResource | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  // Import Dialog State
  const [importTargetDeckId, setImportTargetDeckId] = useState<string>(decks[0]?.id || '');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState('');

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTab, setUploadTab] = useState<'file' | 'paste'>('file');
  const [fileToExtract, setFileToExtract] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionMsg, setExtractionMsg] = useState('');

  // Upload Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formSubject, setFormSubject] = useState('Networking');
  const [formDescription, setFormDescription] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch public library list
  const fetchLibrary = async () => {
    setLoading(true);
    setError('');
    const res = await listLibraryResources();
    if (res.success && res.data && res.data.length > 0) {
      setResources(res.data);
      setUseFirestore(true);
    } else {
      // Fallback to demo items if empty or firestore unready
      setResources(DEMO_LIBRARY_RESOURCES);
      setUseFirestore(false);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  // Filtered & Sorted resources
  const filteredResources = useMemo(() => {
    let result = [...resources];

    if (selectedSubject !== 'All') {
      result = result.filter(r => r.subject.toLowerCase() === selectedSubject.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        r =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.subject.toLowerCase().includes(q) ||
          r.tags.some(t => t.toLowerCase().includes(q)) ||
          r.authorName.toLowerCase().includes(q)
      );
    }

    if (sortBy === 'views') {
      result.sort((a, b) => (b.views || 0) - (a.views || 0));
    } else if (sortBy === 'imports') {
      result.sort((a, b) => (b.importsCount || 0) - (a.importsCount || 0));
    } else if (sortBy === 'newest') {
      result.sort((a, b) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tB - tA;
      });
    }

    return result;
  }, [resources, selectedSubject, searchQuery, sortBy]);

  // Open resource for reading
  const handleOpenResource = async (meta: LibraryResourceMeta) => {
    setLoadingContent(true);
    setActiveResource(null);

    // Increment view count in background
    if (useFirestore) {
      incrementResourceViews(meta.id);
    }

    // Check if demo content
    const demoFound = DEMO_LIBRARY_RESOURCES.find(d => d.id === meta.id);
    if (demoFound) {
      setActiveResource(demoFound);
      setLoadingContent(false);
      return;
    }

    // Fetch from Firestore
    const res = await getLibraryResource(meta.id);
    if (res.success && res.data) {
      setActiveResource(res.data);
    } else {
      alert(res.error || 'Failed to load document content');
    }
    setLoadingContent(false);
  };

  // Extract text from file upload (.docx, .pdf, .txt)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileToExtract(file);
    setIsExtracting(true);
    setExtractionMsg(`Reading "${file.name}"...`);
    setPublishError('');

    try {
      let extractedText = '';
      const nameLower = file.name.toLowerCase();

      if (nameLower.endsWith('.docx')) {
        setExtractionMsg('Extracting text from Word document...');
        extractedText = await extractTextFromDocx(file);
      } else if (nameLower.endsWith('.pdf')) {
        setExtractionMsg('Extracting text from PDF document...');
        extractedText = await extractTextFromPdf(file);
      } else {
        setExtractionMsg('Reading text file...');
        extractedText = await file.text();
      }

      setFormContent(extractedText);
      if (!formTitle) {
        // Auto-generate title from filename
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setFormTitle(cleanName);
      }
      setExtractionMsg('Text extracted successfully!');
    } catch (err: any) {
      console.error(err);
      setPublishError(err?.message || 'Failed to extract text from file');
    } finally {
      setIsExtracting(false);
    }
  };

  // Publish Resource to Library
  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) { setPublishError('Document title is required.'); return; }
    if (!formContent.trim()) { setPublishError('Please provide document content or upload a valid file.'); return; }

    setIsPublishing(true);
    setPublishError('');

    const tagsArray = formTags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    let fileType: 'pdf' | 'docx' | 'txt' | 'text' = 'text';
    if (fileToExtract) {
      const ext = fileToExtract.name.toLowerCase();
      if (ext.endsWith('.docx')) fileType = 'docx';
      else if (ext.endsWith('.pdf')) fileType = 'pdf';
      else if (ext.endsWith('.txt')) fileType = 'txt';
    }

    const res = await uploadLibraryResource({
      title: formTitle,
      subject: formSubject,
      description: formDescription,
      content: formContent,
      tags: tagsArray,
      fileType,
      originalFileName: fileToExtract?.name || '',
    });

    if (res.success) {
      setShowUploadModal(false);
      // Reset form
      setFormTitle('');
      setFormDescription('');
      setFormContent('');
      setFormTags('');
      setFileToExtract(null);
      fetchLibrary();
    } else {
      setPublishError(res.error || 'Failed to publish to Library');
    }
    setIsPublishing(false);
  };

  // Import active resource into user's deck
  const handleConfirmImport = async () => {
    if (!activeResource || !importTargetDeckId) return;
    setIsImporting(true);
    setImportSuccessMsg('');
    try {
      await onImportToDeck(importTargetDeckId, activeResource.content);
      if (useFirestore) {
        incrementResourceImports(activeResource.id);
      }
      setImportSuccessMsg('Successfully imported into your deck Study Material!');
      setTimeout(() => {
        setShowImportDialog(false);
        setImportSuccessMsg('');
      }, 1500);
    } catch (err: any) {
      alert('Failed to import into deck: ' + err?.message);
    } finally {
      setIsImporting(false);
    }
  };

  // Delete resource (author only)
  const handleDeleteResource = async (id: string) => {
    if (!confirm('Are you sure you want to delete this library resource?')) return;
    const res = await deleteLibraryResource(id);
    if (res.success) {
      if (activeResource?.id === id) setActiveResource(null);
      fetchLibrary();
    } else {
      alert(res.error || 'Failed to delete resource');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-12">
      {/* Header Banner */}
      <div
        className="relative overflow-hidden rounded-2xl border p-6 sm:p-8"
        style={{
          background: 'linear-gradient(135deg, #161B22 0%, #0D1117 100%)',
          borderColor: '#2D333B',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 rounded-full bg-[#E3B341]/5 blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest bg-[#E3B341]/10 text-[#E3B341] border border-[#E3B341]/30">
                <Globe size={11} /> Public Repository
              </span>
              <span className="text-xs font-mono text-[#8B949E]">
                {resources.length} Shared Documents
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <BookOpen className="text-[#E3B341]" size={24} />
              Public Study Library
            </h1>

            <p className="text-xs sm:text-sm text-[#8B949E] max-w-xl leading-relaxed">
              Explore and share study notes, textbook summaries, Word documents, and PDFs.
              Read any resource instantly or import it directly into your local flashcard deck.
            </p>
          </div>

          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-[#0F1115] transition-all cursor-pointer shadow-lg hover:brightness-110 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #E3B341 0%, #F0C24F 100%)',
              boxShadow: '0 0 20px rgba(227, 179, 65, 0.3)',
            }}
          >
            <Upload size={15} />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#161B22] p-3 rounded-xl border border-[#2D333B]">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by title, subject, tags, or author..."
            className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg pl-9 pr-4 py-2 text-xs font-mono text-[#E0E0E0] focus:outline-none focus:border-[#E3B341] placeholder-[#484F58]"
          />
        </div>

        {/* Subject Category Filter */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
          {['All', 'Networking', 'Routing', 'Security', 'Hardware', 'General'].map(sub => (
            <button
              key={sub}
              onClick={() => setSelectedSubject(sub)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-semibold uppercase tracking-wider transition-all cursor-pointer flex-shrink-0 ${
                selectedSubject === sub
                  ? 'bg-[#E3B341] text-[#0F1115] font-bold shadow-sm'
                  : 'bg-[#21262D] text-[#8B949E] hover:text-white hover:bg-[#30363D]'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>

        {/* Sort Selector */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as any)}
          className="bg-[#0D1117] border border-[#30363D] text-[#8B949E] text-xs font-mono rounded-lg px-3 py-2 focus:outline-none focus:border-[#E3B341] cursor-pointer"
        >
          <option value="views">🔥 Most Viewed</option>
          <option value="imports">📥 Most Imported</option>
          <option value="newest">✨ Newest First</option>
        </select>
      </div>

      {/* Main Grid View */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3">
          <Loader2 size={32} className="animate-spin text-[#E3B341]" />
          <p className="text-xs font-mono text-[#8B949E]">Loading Public Library resources...</p>
        </div>
      ) : filteredResources.length === 0 ? (
        <div className="bg-[#161B22] border border-[#2D333B] rounded-2xl p-12 text-center space-y-4">
          <FileText size={48} className="mx-auto text-[#484F58]" />
          <h3 className="text-base font-bold text-white uppercase tracking-wider">No Documents Found</h3>
          <p className="text-xs text-[#8B949E] max-w-md mx-auto">
            No study materials matched your search query "{searchQuery}". Try selecting another category or publish the first document!
          </p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-[#21262D] hover:bg-[#30363D] text-white text-xs font-semibold uppercase tracking-wider rounded-lg border border-[#30363D] transition-all cursor-pointer"
          >
            Upload Study Document
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredResources.map(item => {
            const theme = getSubjectTheme(item.subject);
            const isOwner = userId && item.authorId === userId;

            return (
              <div
                key={item.id}
                className="group bg-[#161B22] border border-[#2D333B] hover:border-[#E3B341]/50 rounded-xl p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:-translate-y-1 relative"
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider"
                      style={{ background: theme.bg, color: theme.text, border: `1px solid ${theme.border}` }}
                    >
                      <Tag size={10} style={{ color: theme.iconColor }} />
                      {item.subject}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 bg-[#0D1117] text-[#8B949E] border border-[#30363D] rounded">
                        {item.fileType.toUpperCase()}
                      </span>
                      {isOwner && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteResource(item.id);
                          }}
                          className="p-1 text-[#8B949E] hover:text-[#F85149] rounded transition-colors"
                          title="Delete resource"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-[#E3B341] transition-colors line-clamp-2 leading-snug">
                      {item.title}
                    </h3>
                    {item.description && (
                      <p className="text-xs text-[#8B949E] line-clamp-2 mt-1.5 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Tags */}
                  {item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {item.tags.slice(0, 3).map((t, idx) => (
                        <span key={idx} className="text-[9px] font-mono text-[#8B949E] bg-[#0D1117] px-1.5 py-0.5 rounded border border-[#2D333B]">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer metadata */}
                <div className="mt-4 pt-3 border-t border-[#2D333B] flex items-center justify-between text-[10px] font-mono text-[#8B949E]">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1" title="Views">
                      <Eye size={11} className="text-[#388BFD]" /> {item.views || 0}
                    </span>
                    <span className="flex items-center gap-1" title="Imports">
                      <BookmarkPlus size={11} className="text-[#3FB950]" /> {item.importsCount || 0}
                    </span>
                    <span className="flex items-center gap-1" title="Reading time">
                      <Clock size={11} /> ~{item.estimatedReadTime || 1}m
                    </span>
                  </div>

                  <button
                    onClick={() => handleOpenResource(item)}
                    className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#E3B341] hover:underline cursor-pointer"
                  >
                    <span>Read</span>
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Document Reader Modal / Screen ── */}
      {loadingContent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center space-y-3">
          <Loader2 size={36} className="animate-spin text-[#E3B341]" />
          <p className="text-sm font-mono text-white">Opening Document Reader...</p>
        </div>
      )}

      {activeResource && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 animate-fade-in flex flex-col items-center">
          <div className="w-full max-w-4xl bg-[#161B22] border border-[#30363D] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto min-h-[80vh]">
            {/* Reader Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[#2D333B] bg-[#0D1117]">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setActiveResource(null)}
                  className="p-1.5 text-[#8B949E] hover:text-white hover:bg-[#21262D] rounded-lg transition-colors cursor-pointer"
                  title="Close Reader"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-[#E3B341] font-bold">
                      {activeResource.subject} Library Document
                    </span>
                    <span className="text-[9px] font-mono text-[#8B949E]">
                      by {activeResource.authorName}
                    </span>
                  </div>
                  <h2 className="text-sm sm:text-base font-bold text-white truncate leading-tight">
                    {activeResource.title}
                  </h2>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Import to My Deck */}
                <button
                  onClick={() => setShowImportDialog(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3FB950] hover:bg-[#4ade80] text-[#0F1115] text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
                >
                  <BookmarkPlus size={13} />
                  <span>Import to Deck</span>
                </button>

                {/* AI Generator Link */}
                {onOpenAiGeneratorWithText && (
                  <button
                    onClick={() => {
                      const txt = activeResource.content;
                      setActiveResource(null);
                      onOpenAiGeneratorWithText(txt);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
                  >
                    <Sparkles size={13} />
                    <span>Generate Flashcards</span>
                  </button>
                )}
              </div>
            </div>

            {/* Reader Content Body */}
            <div className="flex-1 p-6 sm:p-10 overflow-y-auto bg-[#12161C]">
              <div className="prose-study max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {activeResource.content}
                </ReactMarkdown>
              </div>
            </div>

            {/* Reader Footer */}
            <div className="px-6 py-3 border-t border-[#2D333B] bg-[#0D1117] flex items-center justify-between text-[11px] font-mono text-[#8B949E]">
              <span>Word Count: {activeResource.wordCount || 0} words</span>
              <span>Reading Time: ~{activeResource.estimatedReadTime || 1} mins</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Import to Deck Dialog ── */}
      {showImportDialog && activeResource && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl animate-fade-in">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <BookmarkPlus className="text-[#3FB950]" size={18} />
              Import to Study Material
            </h3>
            <p className="text-xs text-[#8B949E] leading-relaxed">
              Select which flashcard deck you want to copy "{activeResource.title}" into as study notes:
            </p>

            <select
              value={importTargetDeckId}
              onChange={e => setImportTargetDeckId(e.target.value)}
              className="w-full bg-[#0D1117] border border-[#30363D] text-white text-xs font-mono rounded-lg p-3 focus:outline-none focus:border-[#3FB950]"
            >
              {decks.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            {importSuccessMsg && (
              <div className="flex items-center gap-2 p-3 bg-[#3FB950]/10 border border-[#3FB950]/30 text-[#3FB950] text-xs rounded-lg font-mono">
                <Check size={14} />
                <span>{importSuccessMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowImportDialog(false)}
                className="px-4 py-2 bg-[#21262D] hover:bg-[#30363D] text-white text-xs font-mono rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={isImporting || !importTargetDeckId}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3FB950] hover:bg-[#4ade80] disabled:opacity-50 text-[#0F1115] text-xs font-bold font-mono rounded-lg cursor-pointer"
              >
                {isImporting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span>Import Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload Modal ── */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-6 sm:p-8 w-full max-w-2xl space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-[#2D333B] pb-4">
              <div className="flex items-center gap-2">
                <Upload className="text-[#E3B341]" size={20} />
                <h3 className="text-base font-bold text-white tracking-tight">Upload to Public Library</h3>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-[#8B949E] hover:text-white text-sm font-mono cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Upload Method Tabs */}
            <div className="flex items-center gap-2 bg-[#0D1117] p-1 rounded-xl border border-[#30363D]">
              <button
                type="button"
                onClick={() => setUploadTab('file')}
                className={`flex-1 py-2 text-xs font-mono font-bold uppercase rounded-lg transition-all cursor-pointer ${
                  uploadTab === 'file' ? 'bg-[#21262D] text-white shadow-sm' : 'text-[#8B949E] hover:text-white'
                }`}
              >
                📁 Upload Document File (.docx, .pdf, .txt)
              </button>
              <button
                type="button"
                onClick={() => setUploadTab('paste')}
                className={`flex-1 py-2 text-xs font-mono font-bold uppercase rounded-lg transition-all cursor-pointer ${
                  uploadTab === 'paste' ? 'bg-[#21262D] text-white shadow-sm' : 'text-[#8B949E] hover:text-white'
                }`}
              >
                ✍️ Paste Text Directly
              </button>
            </div>

            <form onSubmit={handlePublish} className="space-y-4">
              {/* File Dropzone */}
              {uploadTab === 'file' && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#30363D] hover:border-[#E3B341] rounded-xl p-6 text-center cursor-pointer bg-[#0D1117]/50 transition-all hover:bg-[#0D1117]"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,.pdf,.txt,.md"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <FileText size={32} className="mx-auto text-[#E3B341] mb-2" />
                  <p className="text-xs font-bold text-white">
                    {fileToExtract ? fileToExtract.name : 'Click to select a Word (.docx), PDF (.pdf), or Text file'}
                  </p>
                  <p className="text-[10px] font-mono text-[#8B949E] mt-1">
                    Text will be automatically extracted and formatted into Markdown
                  </p>
                </div>
              )}

              {/* Extraction Progress Spinner */}
              {isExtracting && (
                <div className="flex items-center gap-2 p-3 bg-[#E3B341]/10 border border-[#E3B341]/30 text-[#E3B341] text-xs font-mono rounded-xl">
                  <Loader2 size={15} className="animate-spin" />
                  <span>{extractionMsg}</span>
                </div>
              )}

              {/* Form Input Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-mono font-bold uppercase text-[#8B949E] mb-1">
                    Document Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="e.g. CCNA 200-301 Subnetting Guide"
                    className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#E3B341]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-bold uppercase text-[#8B949E] mb-1">
                    Subject Category
                  </label>
                  <select
                    value={formSubject}
                    onChange={e => setFormSubject(e.target.value)}
                    className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#E3B341] cursor-pointer"
                  >
                    <option value="Networking">Networking</option>
                    <option value="Routing">Routing</option>
                    <option value="Security">Security</option>
                    <option value="Hardware">Hardware</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold uppercase text-[#8B949E] mb-1">
                  Short Description
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="A brief summary of what this document covers..."
                  className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#E3B341]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold uppercase text-[#8B949E] mb-1">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={formTags}
                  onChange={e => setFormTags(e.target.value)}
                  placeholder="CCNA, Subnetting, OSI, Switching"
                  className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#E3B341]"
                />
              </div>

              {/* Text Area for manual text or extracted preview */}
              <div>
                <label className="block text-[11px] font-mono font-bold uppercase text-[#8B949E] mb-1">
                  Document Content (Markdown supported) *
                </label>
                <textarea
                  required
                  rows={8}
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  placeholder="## Document Title&#10;&#10;Paste your notes or extract text from a file above..."
                  className="w-full bg-[#0D1117] border border-[#30363D] rounded-xl p-3 text-xs font-mono text-white focus:outline-none focus:border-[#E3B341]"
                />
              </div>

              {publishError && (
                <div className="flex items-center gap-2 p-3 bg-[#F85149]/10 border border-[#F85149]/30 text-[#F85149] text-xs font-mono rounded-xl">
                  <AlertCircle size={15} />
                  <span>{publishError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2D333B]">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 bg-[#21262D] hover:bg-[#30363D] text-white text-xs font-mono rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPublishing || isExtracting}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-[#E3B341] hover:bg-[#F0C24F] disabled:opacity-50 text-[#0F1115] text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
                >
                  {isPublishing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  <span>Publish to Library</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
