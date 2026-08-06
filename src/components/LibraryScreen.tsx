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
import { autoFormatStudyContent, splitDocumentIntoPages } from '../utils/textFormatter';
import {
  BookOpen, Search, Upload, Eye, FileText, Trash2, ArrowLeft,
  Sparkles, Clock, Tag, Check, AlertCircle, Loader2, ChevronRight, ChevronLeft,
  BookmarkPlus, Globe, List, Type, Sun, Moon, Maximize2, Share2, Layers, Wand2, X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { generateQuizFromText, type QuizQuestion, getAiConfig, createGroqClient } from '../utils/groq';

interface LibraryScreenProps {
  decks: Deck[];
  userId?: string;
  userName?: string;
  onImportToDeck: (deckId: string, studyMaterial: string) => Promise<void>;
  onOpenAiGeneratorWithText?: (text: string) => void;
}

const SUBJECT_THEMES: Record<string, { bg: string; text: string; border: string; iconColor: string; gradient: string }> = {
  Communication: { bg: 'rgba(227, 179, 65, 0.12)', text: '#E3B341', border: 'rgba(227, 179, 65, 0.3)', iconColor: '#E3B341', gradient: 'linear-gradient(135deg, rgba(227,179,65,0.15) 0%, rgba(227,179,65,0.02) 100%)' },
  'IT & Systems': { bg: 'rgba(227, 179, 65, 0.12)', text: '#E3B341', border: 'rgba(227, 179, 65, 0.3)', iconColor: '#E3B341', gradient: 'linear-gradient(135deg, rgba(227,179,65,0.15) 0%, rgba(227,179,65,0.02) 100%)' },
  'Computer Science': { bg: 'rgba(227, 179, 65, 0.12)', text: '#E3B341', border: 'rgba(227, 179, 65, 0.3)', iconColor: '#E3B341', gradient: 'linear-gradient(135deg, rgba(227,179,65,0.15) 0%, rgba(227,179,65,0.02) 100%)' },
  Mathematics: { bg: 'rgba(227, 179, 65, 0.12)', text: '#E3B341', border: 'rgba(227, 179, 65, 0.3)', iconColor: '#E3B341', gradient: 'linear-gradient(135deg, rgba(227,179,65,0.15) 0%, rgba(227,179,65,0.02) 100%)' },
  Science: { bg: 'rgba(227, 179, 65, 0.12)', text: '#E3B341', border: 'rgba(227, 179, 65, 0.3)', iconColor: '#E3B341', gradient: 'linear-gradient(135deg, rgba(227,179,65,0.15) 0%, rgba(227,179,65,0.02) 100%)' },
  Business: { bg: 'rgba(227, 179, 65, 0.12)', text: '#E3B341', border: 'rgba(227, 179, 65, 0.3)', iconColor: '#E3B341', gradient: 'linear-gradient(135deg, rgba(227,179,65,0.15) 0%, rgba(227,179,65,0.02) 100%)' },
  General: { bg: 'rgba(227, 179, 65, 0.12)', text: '#E3B341', border: 'rgba(227, 179, 65, 0.3)', iconColor: '#E3B341', gradient: 'linear-gradient(135deg, rgba(227,179,65,0.15) 0%, rgba(227,179,65,0.02) 100%)' },
};

function getSubjectTheme(subject: string) {
  if (SUBJECT_THEMES[subject]) return SUBJECT_THEMES[subject];
  return {
    text: '#E3B341',
    bg: 'rgba(227, 179, 65, 0.12)',
    border: 'rgba(227, 179, 65, 0.3)',
    iconColor: '#E3B341',
    gradient: 'linear-gradient(135deg, rgba(227,179,65,0.15) 0%, rgba(13,17,23,0.8) 100%)',
  };
}

/** Extract table of contents (headings) from document markdown */
function extractTOC(content: string): { title: string; id: string; level: number }[] {
  if (!content) return [];
  const lines = content.split('\n');
  const headings: { title: string; id: string; level: number }[] = [];

  lines.forEach((line) => {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const title = match[2].replace(/[\*\_`]/g, '').trim();
      const id = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      headings.push({ title, id, level });
    }
  });

  return headings;
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

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'views' | 'newest' | 'imports'>('views');

  // Active Reader Modal
  const [activeResource, setActiveResource] = useState<LibraryResource | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [readerTheme, setReaderTheme] = useState<'dark' | 'sepia' | 'oled'>('dark');
  const [readerFontSize, setReaderFontSize] = useState<'normal' | 'large'>('normal');
  const [showTOC, setShowTOC] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [currentReaderPage, setCurrentReaderPage] = useState(0);

  // Import Dialog State
  const [importTargetDeckId, setImportTargetDeckId] = useState<string>(decks[0]?.id || '');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // AI Quiz Modal State
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizError, setQuizError] = useState('');
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
  const readerScrollRef = useRef<HTMLDivElement>(null);

  // Fetch public library list
  const fetchLibrary = async () => {
    setLoading(true);
    const res = await listLibraryResources();
    if (res.success && res.data && res.data.length > 0) {
      setResources(res.data);
      setUseFirestore(true);
    } else {
      setResources(DEMO_LIBRARY_RESOURCES);
      setUseFirestore(false);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  // Track reader scroll progress
  const handleReaderScroll = () => {
    if (!readerScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = readerScrollRef.current;
    const total = scrollHeight - clientHeight;
    const progress = total > 0 ? (scrollTop / total) * 100 : 0;
    setScrollProgress(progress);
  };

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
    setScrollProgress(0);
    setCurrentReaderPage(0);

    if (useFirestore) {
      incrementResourceViews(meta.id);
    }

    const demoFound = DEMO_LIBRARY_RESOURCES.find(d => d.id === meta.id);
    if (demoFound) {
      const formattedContent = autoFormatStudyContent(demoFound.content);
      setActiveResource({ ...demoFound, content: formattedContent });
      setLoadingContent(false);
      return;
    }

    const res = await getLibraryResource(meta.id);
    if (res.success && res.data) {
      const formattedContent = autoFormatStudyContent(res.data.content);
      setActiveResource({ ...res.data, content: formattedContent });
    } else {
      alert(res.error || 'Failed to load document content');
    }
    setLoadingContent(false);
  };

  // Compute pages for active document
  const readerPages = useMemo(() => {
    return activeResource ? splitDocumentIntoPages(activeResource.content) : [];
  }, [activeResource]);

  // Extract table of contents for active document
  const tocList = useMemo(() => {
    return activeResource ? extractTOC(activeResource.content) : [];
  }, [activeResource]);

  const handleGenerateQuiz = async () => {
    if (!activeResource) return;
    const aiConfig = getAiConfig();
    if (!aiConfig) {
      alert("AI features are not configured.");
      return;
    }
    
    setShowQuizModal(true);
    setIsGeneratingQuiz(true);
    setQuizError('');
    setQuizQuestions([]);
    setCurrentQuizIndex(0);
    setSelectedQuizOption(null);
    setQuizScore(0);
    
    try {
      const client = createGroqClient(aiConfig.apiKey, aiConfig.baseUrl);
      // Use current page if paginated, else whole doc
      const textToQuiz = readerPages.length > 0 ? readerPages[currentReaderPage] : activeResource.content;
      const questions = await generateQuizFromText(client, textToQuiz);
      if (questions.length === 0) throw new Error("No questions generated.");
      setQuizQuestions(questions);
    } catch (err) {
      console.error(err);
      setQuizError(err instanceof Error ? err.message : 'Failed to generate quiz');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleQuizAnswer = (option: string) => {
    if (selectedQuizOption) return; // already answered this question
    setSelectedQuizOption(option);
    const q = quizQuestions[currentQuizIndex];
    if (option === q.correctAnswer) {
      setQuizScore(s => s + 1);
    }
  };

  const handleNextQuizQuestion = () => {
    if (currentQuizIndex + 1 < quizQuestions.length) {
      setCurrentQuizIndex(i => i + 1);
      setSelectedQuizOption(null);
    }
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

      // Auto-format raw extracted text into clean structured Markdown
      const cleanFormatted = autoFormatStudyContent(extractedText);
      setFormContent(cleanFormatted);

      if (!formTitle) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setFormTitle(cleanName);
      }
      setExtractionMsg('Text extracted & auto-formatted successfully!');
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

  // Theme styles for Reader View
  const readerThemeStyles = {
    dark: { bg: '#0D1117', panelBg: '#161B22', text: '#E0E0E0', border: '#2D333B' },
    sepia: { bg: '#FBF0D9', panelBg: '#F4E8CE', text: '#433422', border: '#E6D7B8' },
    oled: { bg: '#000000', panelBg: '#0F0F0F', text: '#EEEEEE', border: '#222222' },
  }[readerTheme];

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
              Read any resource in our immersive reader or import it into your study deck.
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
          {['All', 'Communication', 'IT & Systems', 'Computer Science', 'Mathematics', 'Science', 'Business', 'General'].map(sub => (
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredResources.map(item => {
            const theme = getSubjectTheme(item.subject);
            const isOwner = userId && item.authorId === userId;

            return (
              <div
                key={item.id}
                onClick={() => handleOpenResource(item)}
                className="group bg-[#161B22] border border-[#2D333B] hover:border-[#E3B341]/60 rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl hover:-translate-y-1.5 cursor-pointer relative overflow-hidden"
              >
                {/* Accent Top Strip */}
                <div
                  className="absolute top-0 left-0 right-0 h-1 transition-all duration-300 group-hover:h-1.5"
                  style={{ background: '#E3B341' }}
                />

                <div className="space-y-3.5 pt-1">
                  {/* Subject Badge & File Format */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider"
                      style={{ background: theme.bg, color: theme.text, border: `1px solid ${theme.border}` }}
                    >
                      <Tag size={10} style={{ color: theme.iconColor }} />
                      {item.subject}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 bg-[#0D1117] text-[#8B949E] border border-[#30363D] rounded-md">
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
                    <h3 className="text-base font-bold text-white group-hover:text-[#E3B341] transition-colors line-clamp-2 leading-snug">
                      {item.title}
                    </h3>
                    {item.description && (
                      <p className="text-xs text-[#8B949E] line-clamp-2 mt-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Tags */}
                  {item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {item.tags.slice(0, 3).map((t, idx) => (
                        <span key={idx} className="text-[9px] font-mono text-[#8B949E] bg-[#0D1117] px-2 py-0.5 rounded-md border border-[#2D333B]">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer metadata */}
                <div className="mt-5 pt-3.5 border-t border-[#2D333B] flex items-center justify-between text-[10px] font-mono text-[#8B949E]">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1" title="Views">
                      <Eye size={12} className="text-[#E3B341]" /> {item.views || 0}
                    </span>
                    <span className="flex items-center gap-1" title="Imports">
                      <BookmarkPlus size={12} className="text-[#3FB950]" /> {item.importsCount || 0}
                    </span>
                    <span className="flex items-center gap-1" title="Reading time">
                      <Clock size={12} /> ~{item.estimatedReadTime || 1}m
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#E3B341] group-hover:translate-x-1 transition-transform">
                    <span>Read</span>
                    <ChevronRight size={12} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── HIGH-END EBOOK / DOCUMENT READER ── */}
      {loadingContent && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex flex-col items-center justify-center space-y-3">
          <Loader2 size={40} className="animate-spin text-[#E3B341]" />
          <p className="text-sm font-mono text-white tracking-wider">Opening Digital Reader...</p>
        </div>
      )}

      {activeResource && (
        <div
          className="fixed inset-0 z-50 flex flex-col overflow-hidden animate-fade-in"
          style={{ background: readerThemeStyles.bg, color: readerThemeStyles.text }}
        >
          {/* Top Reading Progress Bar */}
          <div className="h-1 bg-black/20 w-full relative z-20">
            <div
              className="h-full transition-all duration-150"
              style={{
                width: `${scrollProgress}%`,
                background: 'linear-gradient(90deg, #E3B341, #F0C24F)',
                boxShadow: '0 0 10px rgba(227,179,65,0.6)',
              }}
            />
          </div>

          {/* Reader App Bar */}
          <header
            className="flex items-center justify-between px-4 sm:px-6 py-3 border-b z-20"
            style={{ background: readerThemeStyles.panelBg, borderColor: readerThemeStyles.border }}
          >
            {/* Left: Back & Document Metadata */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setActiveResource(null)}
                className="p-2 rounded-lg transition-colors cursor-pointer opacity-80 hover:opacity-100 hover:bg-white/10"
                title="Back to Library"
              >
                <ArrowLeft size={18} />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#E3B341]">
                    {activeResource.subject}
                  </span>
                  <span className="text-[9px] font-mono opacity-60">
                    by {activeResource.authorName}
                  </span>
                </div>
                <h2 className="text-sm sm:text-base font-bold truncate leading-tight">
                  {activeResource.title}
                </h2>
              </div>
            </div>

            {/* Center / Right: Reader Controls & Actions */}
            <div className="flex items-center gap-2">
              {/* Toggle Table of Contents */}
              {tocList.length > 0 && (
                <button
                  onClick={() => setShowTOC(!showTOC)}
                  className={`p-2 rounded-lg text-xs font-mono flex items-center gap-1 transition-all cursor-pointer ${
                    showTOC ? 'bg-[#E3B341] text-[#0F1115] font-bold' : 'opacity-70 hover:opacity-100 hover:bg-white/10'
                  }`}
                  title="Table of Contents"
                >
                  <List size={15} />
                  <span className="hidden sm:inline">Outline</span>
                </button>
              )}

              {/* Reader Theme Selector */}
              <div className="hidden sm:flex items-center gap-1 p-1 rounded-lg border border-white/10 bg-black/20">
                <button
                  onClick={() => setReaderTheme('dark')}
                  className={`p-1.5 rounded transition-all cursor-pointer ${
                    readerTheme === 'dark' ? 'bg-[#21262D] text-[#E3B341]' : 'opacity-50 hover:opacity-100'
                  }`}
                  title="Dark Studio Theme"
                >
                  <Moon size={14} />
                </button>
                <button
                  onClick={() => setReaderTheme('sepia')}
                  className={`p-1.5 rounded transition-all cursor-pointer ${
                    readerTheme === 'sepia' ? 'bg-[#E6D7B8] text-[#433422]' : 'opacity-50 hover:opacity-100'
                  }`}
                  title="Warm Sepia Reading Theme"
                >
                  <Sun size={14} />
                </button>
                <button
                  onClick={() => setReaderTheme('oled')}
                  className={`p-1.5 rounded transition-all cursor-pointer ${
                    readerTheme === 'oled' ? 'bg-[#222222] text-white' : 'opacity-50 hover:opacity-100'
                  }`}
                  title="OLED Pitch Black"
                >
                  <Maximize2 size={14} />
                </button>
              </div>

              {/* Text Size Toggle */}
              <button
                onClick={() => setReaderFontSize(readerFontSize === 'normal' ? 'large' : 'normal')}
                className="p-2 rounded-lg opacity-70 hover:opacity-100 hover:bg-white/10 transition-all cursor-pointer font-mono text-xs flex items-center gap-1"
                title="Toggle Text Size"
              >
                <Type size={15} />
                <span className="text-[10px] font-bold">{readerFontSize === 'normal' ? '100%' : '125%'}</span>
              </button>

              {/* Generate Quiz CTA */}
              <button
                onClick={handleGenerateQuiz}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
              >
                <Wand2 size={14} />
                <span className="hidden sm:inline">Generate Quiz</span>
              </button>

              {/* Import to Deck CTA */}
              <button
                onClick={() => setShowImportDialog(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3FB950] hover:bg-[#4ade80] text-[#0F1115] text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
              >
                <BookmarkPlus size={14} />
                <span className="hidden sm:inline">Import to Deck</span>
              </button>

              {/* Generate AI Cards CTA */}
              {onOpenAiGeneratorWithText && (
                <button
                  onClick={() => {
                    const txt = activeResource.content;
                    setActiveResource(null);
                    onOpenAiGeneratorWithText(txt);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
                >
                  <Sparkles size={14} />
                  <span className="hidden sm:inline">Flashcards</span>
                </button>
              )}
            </div>
          </header>

          {/* Reader Body (Split View: TOC + Main Page) */}
          <div className="flex-1 flex overflow-hidden">
            {/* Table of Contents Side Panel */}
            {showTOC && tocList.length > 0 && (
              <aside
                className="w-64 border-r overflow-y-auto p-4 hidden md:block flex-shrink-0 transition-all"
                style={{ background: readerThemeStyles.panelBg, borderColor: readerThemeStyles.border }}
              >
                <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/10">
                  <List size={14} className="text-[#E3B341]" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider">Document Outline</span>
                </div>

                <nav className="space-y-1">
                  {tocList.map((item, idx) => (
                    <a
                      key={idx}
                      href={`#${item.id}`}
                      className="block text-xs font-mono py-1.5 px-2 rounded hover:bg-white/10 transition-colors line-clamp-1 opacity-80 hover:opacity-100"
                      style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                    >
                      {item.title}
                    </a>
                  ))}
                </nav>
              </aside>
            )}

            {/* Center Page Container */}
            <main
              ref={readerScrollRef}
              onScroll={handleReaderScroll}
              className="flex-1 overflow-y-auto p-4 sm:p-10 flex flex-col items-center"
            >
              {/* Document Cover Banner — compact slim strip */}
              <div
                className="w-full max-w-5xl rounded-xl px-4 py-2 mb-4 border flex items-center gap-3 flex-wrap"
                style={{
                  background: getSubjectTheme(activeResource.subject).gradient,
                  borderColor: readerThemeStyles.border,
                }}
              >
                {/* Subject badge */}
                <span
                  className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-widest shrink-0"
                  style={{
                    background: getSubjectTheme(activeResource.subject).bg,
                    color: getSubjectTheme(activeResource.subject).text,
                    border: `1px solid ${getSubjectTheme(activeResource.subject).border}`,
                  }}
                >
                  {activeResource.subject}
                </span>

                {/* Title */}
                <span className="text-sm font-bold tracking-tight truncate flex-1 min-w-0">
                  {activeResource.title}
                </span>

                {/* Meta stats */}
                <div className="flex items-center gap-3 text-[10px] font-mono opacity-70 shrink-0">
                  <span>👁️ {activeResource.views || 0}</span>
                  <span>📥 {activeResource.importsCount || 0}</span>
                  <span>⏱️ ~{activeResource.estimatedReadTime || 1}m</span>
                  <span className="px-1.5 py-0.5 rounded bg-black/30 border border-white/10 uppercase">
                    {activeResource.fileType}
                  </span>
                </div>
              </div>

              {/* Main Document Content (Paginated or Continuous) */}
              <div
                className={`w-full max-w-5xl rounded-2xl p-10 sm:p-16 shadow-2xl border mb-6 min-h-[60vh] ${
                  readerFontSize === 'large' ? 'text-lg leading-loose' : 'text-base leading-relaxed'
                }`}
                style={{
                  background: readerThemeStyles.panelBg,
                  borderColor: readerThemeStyles.border,
                }}
              >
                <div className="prose-study max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {readerPages[currentReaderPage] || activeResource.content}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Reader Page Navigation Controls */}
              {readerPages.length > 1 && (
                <div
                  className="w-full max-w-5xl flex items-center justify-between px-5 py-3.5 rounded-xl border mb-16 shadow-lg"
                  style={{
                    background: readerThemeStyles.panelBg,
                    borderColor: readerThemeStyles.border,
                  }}
                >
                  <button
                    onClick={() => {
                      setCurrentReaderPage(p => Math.max(0, p - 1));
                      readerScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={currentReaderPage === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed border border-white/10 hover:bg-white/10"
                  >
                    <ChevronLeft size={14} />
                    <span>Previous</span>
                  </button>

                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="opacity-70">Page</span>
                    <span className="font-bold text-[#E3B341]">{currentReaderPage + 1}</span>
                    <span className="opacity-50">/</span>
                    <span>{readerPages.length}</span>
                  </div>

                  <button
                    onClick={() => {
                      setCurrentReaderPage(p => Math.min(readerPages.length - 1, p + 1));
                      readerScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={currentReaderPage >= readerPages.length - 1}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed border border-transparent bg-[#E3B341] text-[#0F1115] hover:bg-[#F0C24F] shadow-md"
                  >
                    <span>Next</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </main>
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
                    <option value="Communication">Communication</option>
                    <option value="IT & Systems">IT & Systems</option>
                    <option value="Computer Science">Computer Science</option>
                    <option value="Mathematics">Mathematics</option>
                    <option value="Science">Science</option>
                    <option value="Business">Business</option>
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
                  placeholder="Communication, 9 Cs, Ethics, Systems"
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
                  className="w-full bg-[#0D1117] border border-[#30363D] rounded-xl p-3 text-xs font-mono text-[#E0E0E0] focus:outline-none focus:border-[#E3B341]"
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
      {/* AI Quiz Modal */}
      {showQuizModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#161B22] border border-[#2D333B] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-[#2D333B] bg-[#0D1117]">
              <div className="flex items-center gap-2">
                <Wand2 size={16} className="text-[#E3B341]" />
                <h3 className="font-bold text-white tracking-tight">AI Quiz</h3>
              </div>
              <button onClick={() => setShowQuizModal(false)} className="p-1 rounded hover:bg-white/10 transition-colors text-[#8B949E] hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {isGeneratingQuiz ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-12 h-12 rounded-full border-2 border-[#E3B341]/20 border-t-[#E3B341] animate-spin"></div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-white text-lg tracking-tight">Generating Quiz...</h3>
                    <p className="text-xs text-[#8B949E] max-w-xs">AI is reading the material and writing specific questions for you.</p>
                  </div>
                </div>
              ) : quizError ? (
                <div className="py-8 text-center text-[#F85149] font-mono text-sm space-y-2">
                  <AlertCircle size={32} className="mx-auto mb-4" />
                  <p>{quizError}</p>
                </div>
              ) : quizQuestions.length > 0 ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between font-mono text-xs text-[#8B949E]">
                    <span>Question {currentQuizIndex + 1} of {quizQuestions.length}</span>
                    <span>Score: <span className="text-[#3FB950] font-bold">{quizScore}</span></span>
                  </div>

                  <h4 className="text-lg font-bold text-white leading-relaxed">
                    {quizQuestions[currentQuizIndex].question}
                  </h4>

                  <div className="space-y-2">
                    {quizQuestions[currentQuizIndex].options.map((opt, i) => {
                      const isSelected = selectedQuizOption === opt;
                      const isCorrect = opt === quizQuestions[currentQuizIndex].correctAnswer;
                      
                      let btnClass = "w-full p-4 rounded-lg border text-left transition-all font-medium text-sm leading-snug cursor-pointer flex gap-3 ";
                      if (!selectedQuizOption) {
                        btnClass += "bg-[#0D1117] border-[#30363D] hover:border-[#8B949E] text-[#E0E0E0]";
                      } else {
                        if (isCorrect) {
                          btnClass += "bg-[#3FB950]/10 border-[#3FB950] text-[#3FB950]";
                        } else if (isSelected) {
                          btnClass += "bg-[#F85149]/10 border-[#F85149] text-[#F85149]";
                        } else {
                          btnClass += "bg-[#0D1117] border-[#2D333B] opacity-50 text-[#8B949E] cursor-default";
                        }
                      }

                      const letter = String.fromCharCode(65 + i);

                      return (
                        <button
                          key={i}
                          onClick={() => handleQuizAnswer(opt)}
                          disabled={!!selectedQuizOption}
                          className={btnClass}
                        >
                          <span className="font-mono opacity-60 w-4">{letter}</span>
                          <span className="flex-1">{opt}</span>
                          {selectedQuizOption && isCorrect && <Check size={16} className="text-[#3FB950]" />}
                          {selectedQuizOption && isSelected && !isCorrect && <X size={16} className="text-[#F85149]" />}
                        </button>
                      );
                    })}
                  </div>

                  {selectedQuizOption && (
                    <div className="p-4 rounded-lg bg-[#21262D] border border-[#30363D] animate-slide-up space-y-2">
                      <div className="flex justify-between items-start gap-4">
                        <div className="text-xs text-[#E0E0E0] leading-relaxed">
                          <span className="font-bold text-white block mb-1">Explanation:</span>
                          {quizQuestions[currentQuizIndex].explanation}
                        </div>
                        {currentQuizIndex + 1 < quizQuestions.length ? (
                          <button
                            onClick={handleNextQuizQuestion}
                            className="shrink-0 px-4 py-2 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-xs font-bold uppercase tracking-wider rounded cursor-pointer transition-colors"
                          >
                            Next <ChevronRight size={14} className="inline -mt-0.5" />
                          </button>
                        ) : (
                          <div className="shrink-0 flex items-center justify-center p-2 rounded bg-[#3FB950]/20 text-[#3FB950] text-xs font-bold font-mono">
                            Quiz Complete!
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

