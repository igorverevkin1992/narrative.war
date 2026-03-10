
import React, { useState, useMemo, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { ScriptBlock, ProjectType, SeoPackage } from '../types';
import { APP_VERSION, CHARS_PER_SECOND, PROJECT_CONFIGS, DEMONETIZATION_BLACKLIST } from '../constants';
import { Action } from '../store/reducer';
import { calculateDurationAndRetiming, translateBlockToRussian } from '../services/geminiService';
import { getSettings } from '../appSettings';

const PAGE_SIZE = 20;

interface ScriptDisplayProps {
  script: ScriptBlock[];
  topic: string;
  projectType?: ProjectType;
  radarContent?: string;
  analystContent?: string;
  architectContent?: string;
  thumbnailConcept?: string;
  seo?: SeoPackage;
  onGenerateImage?: (index: number) => void;
  dispatch?: React.Dispatch<Action>;
  undoStack?: ScriptBlock[][];
  redoStack?: ScriptBlock[][];
}

// Highlight all occurrences of query in text (case-insensitive)
function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const q = query.toLowerCase().trim();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {highlightText(text.slice(idx + q.length), query)}
    </>
  );
}

// HTML-escape to prevent XSS in exported documents
const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const ScriptDisplay: React.FC<ScriptDisplayProps> = ({
  script,
  topic,
  projectType = 'youtube',
  radarContent,
  analystContent,
  architectContent,
  thumbnailConcept,
  seo,
  onGenerateImage,
  dispatch,
  undoStack,
  redoStack,
}) => {
  const MIN_AUDIO_CHARS = PROJECT_CONFIGS[projectType].minChars;
  const showRu = getSettings().showRussianScript;
  const [loadingImages, setLoadingImages] = useState<number[]>([]);
  const [translatingBlocks, setTranslatingBlocks] = useState<number[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [page]);

  // Ctrl+Z / Ctrl+Y keyboard shortcuts for undo/redo
  useEffect(() => {
    if (!dispatch) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // don't intercept while editing
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); dispatch({ type: 'UNDO_SCRIPT' }); }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); dispatch({ type: 'REDO_SCRIPT' }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);

  const [exportError, setExportError] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [chaptersCopied, setChaptersCopied] = useState(false);
  // Group B: Search/Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  // Group B: Audit Panel
  const [showAudit, setShowAudit] = useState(false);
  // Group B: Translation Check
  const [showTranslationIssues, setShowTranslationIssues] = useState(false);
  // Group B: Asset Library
  const [showAssetLibrary, setShowAssetLibrary] = useState(false);
  // Group C: TTS
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsBlock, setTtsBlock] = useState<number>(0);
  const [ttsRate, setTtsRate] = useState<number>(1);
  // Group F: Inline editing
  const [editingCell, setEditingCell] = useState<{ idx: number; field: 'audioScript' } | null>(null);
  const [editValue, setEditValue] = useState('');

  const filteredBlocks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return script.filter((b, i) => {
      const typeMatch = filterType === 'ALL' || b.blockType === filterType;
      if (!typeMatch) return false;
      if (!q) return true;
      return (
        b.audioScript?.toLowerCase().includes(q) ||
        b.russianScript?.toLowerCase().includes(q) ||
        b.visualCue?.toLowerCase().includes(q)
      );
    }).map((b, _, arr) => ({ block: b, globalIdx: script.indexOf(b) }));
  }, [script, searchQuery, filterType]);

  const totalPages = Math.ceil(filteredBlocks.length / PAGE_SIZE);
  const visibleBlocks = useMemo(
    () => filteredBlocks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredBlocks, page]
  );
  // Global index offset so generate-image still gets the correct index
  const pageOffset = page * PAGE_SIZE;

  // Total audioScript character count and estimated duration
  const { totalAudioChars, estMinutes } = useMemo(() => {
    const total = script.reduce((sum, b) => sum + (b.audioScript?.length ?? 0), 0);
    return { totalAudioChars: total, estMinutes: (total / (CHARS_PER_SECOND * 60)).toFixed(1) };
  }, [script]);

  // Pre-compute audit warning count for Audit button badge
  const auditWarningCount = useMemo(() => {
    const allText = script.map(b => b.audioScript || '').join(' ').toLowerCase();
    let count = 0;
    if (DEMONETIZATION_BLACKLIST.some(w => allText.includes(w))) count++;
    if (script.filter(b => (b.audioScript || '').split(/\s+/).filter(Boolean).length < 30).length) count++;
    if (script[0]?.blockType !== 'HOOK') count++;
    if (script[script.length - 1]?.blockType !== 'OUTRO') count++;
    const maxSalesAudit = projectType === 'documentary' ? 4 : 1;
    const salesCount = script.filter(b => b.blockType === 'SALES').length;
    if (salesCount === 0 || salesCount > maxSalesAudit) count++;
    let maxRun = 0, curRun = 1;
    for (let i = 1; i < script.length; i++) {
      if (script[i].blockType === script[i-1].blockType) { curRun++; maxRun = Math.max(maxRun, curRun); } else { curRun = 1; }
    }
    if (maxRun > 4) count++;
    const estMin = parseFloat(estMinutes);
    const cfg = PROJECT_CONFIGS[projectType];
    const minDur = cfg.minChars / (CHARS_PER_SECOND * 60);
    const maxDur = projectType === 'documentary' ? 9999 : 20;
    if (estMin < minDur || estMin > maxDur) count++;
    return count;
  }, [script, projectType, estMinutes]);

  const handleGenImage = async (index: number) => {
    if (!onGenerateImage) return;
    setLoadingImages(prev => [...prev, index]);
    await onGenerateImage(index);
    setLoadingImages(prev => prev.filter(i => i !== index));
  };

  // Generate storyboard images for all blocks that don't have one yet, sequentially.
  const handleGenAllImages = async () => {
    if (!onGenerateImage || generatingAll) return;
    const missing = script.map((b, i) => i).filter(i => !script[i].imageUrl);
    if (!missing.length) return;
    setGeneratingAll(true);
    setLoadingImages(missing);
    for (const i of missing) {
      await onGenerateImage(i);
      setLoadingImages(prev => prev.filter(idx => idx !== i));
    }
    setGeneratingAll(false);
  };

  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const safeFilename = topic.replace(/[^a-z0-9]/gi, '_').substring(0, 30);

  const handleExportDossierOnly = async () => {
    try {
      setExportError(null);
      const sections = [
        { title: 'AGENT A: RADAR INTERCEPT', content: radarContent || 'No Radar Data Available' },
        { title: 'AGENT B: INTELLIGENCE DOSSIER', content: typeof analystContent === 'string' ? analystContent : JSON.stringify(analystContent, null, 2) || 'No Analyst Data Available' },
        { title: 'AGENT C: STRUCTURE BLUEPRINT', content: architectContent || 'No Architect Data Available' },
      ];
      const children: Paragraph[] = [
        new Paragraph({ text: `INTELLIGENCE DOSSIER: ${topic}`, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: `NARRATIVE.WAR V${APP_VERSION} // RESEARCH DATA ONLY`, bold: true })] }),
        new Paragraph({ text: `Generated: ${new Date().toLocaleString()}` }),
        new Paragraph({ text: '' }),
      ];
      for (const sec of sections) {
        children.push(new Paragraph({ text: sec.title, heading: HeadingLevel.HEADING_2 }));
        for (const line of sec.content.split('\n')) {
          children.push(new Paragraph({ text: line }));
        }
        children.push(new Paragraph({ text: '' }));
      }
      const doc = new Document({ sections: [{ children }] });
      const blob = await Packer.toBlob(doc);
      saveBlob(blob, `DOSSIER_${safeFilename}.docx`);
    } catch (e) {
      setExportError(`Dossier export failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handleExportScriptOnly = async () => {
    try {
      setExportError(null);
      const children: Paragraph[] = [
        new Paragraph({ text: `SCRIPT: ${topic}`, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: `NARRATIVE.WAR V${APP_VERSION} // PRODUCTION SCRIPT`, bold: true })] }),
        new Paragraph({ text: `Generated: ${new Date().toLocaleString()}` }),
        new Paragraph({ text: '' }),
        new Paragraph({ text: 'FINAL SCRIPT', heading: HeadingLevel.HEADING_2 }),
      ];
      for (const block of script) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: `${block.timecode}  [${block.blockType}]`, bold: true, color: 'CC0000' })] }),
          new Paragraph({ children: [new TextRun({ text: `VISUAL: ${block.visualCue}`, italics: true, color: '000099' })] }),
          new Paragraph({ children: [new TextRun({ text: `AUDIO (EN): ${block.audioScript}`, bold: true })] }),
          new Paragraph({ text: `AUDIO (RU): ${block.russianScript || ''}` }),
          new Paragraph({ text: '──────────────────────────────────────────────' }),
        );
      }
      const doc = new Document({ sections: [{ children }] });
      const blob = await Packer.toBlob(doc);
      saveBlob(blob, `SCRIPT_${safeFilename}.docx`);
    } catch (e) {
      setExportError(`Script export failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handleExportExcel = () => {
    try {
      setExportError(null);
      const headers = ["Timecode", "Block Type", "Visual Cue (Technical Task)", "Audio Script (EN)", "Audio Script (RU)"];

      const rows = script.map(block => {
        const safeVisual = `"${block.visualCue.replace(/"/g, '""')}"`;
        const safeAudio = `"${block.audioScript.replace(/"/g, '""')}"`;
        const safeRussian = `"${(block.russianScript || '').replace(/"/g, '""')}"`;
        return `${block.timecode},${block.blockType},${safeVisual},${safeAudio},${safeRussian}`;
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      // BOM (\ufeff) ensures correct Cyrillic display in Excel (#21)
      const blob = new Blob(['\ufeff', csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `TASK_${safeFilename}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(`CSV export failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  // Convert "MM:SS - MM:SS" or "HH:MM:SS - HH:MM:SS" timecode to SRT format "HH:MM:SS,000"
  const timecodeToSrt = (tc: string): { start: string; end: string } => {
    const parts = tc.split(/\s*[-–]\s*/);
    const toSrt = (t: string): string => {
      const segs = t.trim().split(':').map(Number);
      let h = 0, m = 0;
      const s = segs[segs.length - 1] ?? 0;
      if (segs.length === 3) { h = segs[0]; m = segs[1]; }
      else if (segs.length === 2) { m = segs[0]; }
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(Math.floor(s)).padStart(2,'0')},000`;
    };
    return { start: toSrt(parts[0] ?? '00:00'), end: toSrt(parts[1] ?? parts[0] ?? '00:00') };
  };

  const handleExportSRT = (lang: 'en' | 'ru') => {
    try {
      setExportError(null);
      const lines: string[] = [];
      script.forEach((block, i) => {
        const text = lang === 'en' ? block.audioScript : (block.russianScript || block.audioScript);
        if (!text?.trim()) return;
        const { start, end } = timecodeToSrt(block.timecode);
        lines.push(`${i + 1}\n${start} --> ${end}\n${text.trim()}\n`);
      });
      const content = lines.join('\n');
      const blob = new Blob(['\ufeff', content], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SUBTITLES_${lang.toUpperCase()}_${safeFilename}.srt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(`SRT export failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handleExportShotList = async () => {
    try {
      setExportError(null);
      const SHOT_CATEGORIES = ['ВЕДУЩИЙ', 'АРХИВНЫЕ КАДРЫ', 'B-ROLL', 'ДОКУМЕНТ', 'АНИМАЦИЯ ДАННЫХ', 'ИНТЕРВЬЮ', 'ХРОНИКА', 'ТИТР'];
      const groups: Record<string, { timecode: string; blockType: string; visual: string }[]> = {};
      for (const cat of [...SHOT_CATEGORIES, 'OTHER']) groups[cat] = [];

      script.forEach(block => {
        const match = block.visualCue.match(/^\[([^\]]+)\]/);
        const tag = match ? match[1].toUpperCase() : 'OTHER';
        const cat = SHOT_CATEGORIES.includes(tag) ? tag : 'OTHER';
        groups[cat].push({ timecode: block.timecode, blockType: block.blockType, visual: block.visualCue });
      });

      const children: Paragraph[] = [
        new Paragraph({ text: `SHOT LIST / B-ROLL BRIEF: ${topic}`, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: `NARRATIVE.WAR V${APP_VERSION} // PRODUCTION BRIEF`, bold: true })] }),
        new Paragraph({ text: `Generated: ${new Date().toLocaleString()}` }),
        new Paragraph({ text: '' }),
      ];
      for (const cat of [...SHOT_CATEGORIES, 'OTHER']) {
        const items = groups[cat];
        if (!items.length) continue;
        children.push(new Paragraph({ text: `[${cat}] — ${items.length} shots`, heading: HeadingLevel.HEADING_2 }));
        for (const item of items) {
          children.push(
            new Paragraph({ children: [new TextRun({ text: `${item.timecode}  [${item.blockType}]`, bold: true, color: 'CC0000' })] }),
            new Paragraph({ children: [new TextRun({ text: item.visual, italics: true })] }),
            new Paragraph({ text: '' }),
          );
        }
      }
      const doc = new Document({ sections: [{ children }] });
      const blob = await Packer.toBlob(doc);
      saveBlob(blob, `SHOTLIST_${safeFilename}.docx`);
    } catch (e) {
      setExportError(`Shot list export failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handleCopyChapters = () => {
    try {
      setExportError(null);
      const chapters: string[] = [];
      let lastBlockType = '';
      script.forEach(block => {
        const isTransition = block.blockType === 'TRANSITION';
        const isNewSection = block.blockType !== lastBlockType;
        if (isTransition || (isNewSection && chapters.length === 0)) {
          const tc = block.timecode.split(/\s*[-–]\s*/)[0].trim();
          // normalize to M:SS or H:MM:SS
          const segs = tc.split(':').map(s => s.padStart(2, '0'));
          const label = isTransition
            ? (block.overlayFX || block.audioScript || block.blockType).substring(0, 60)
            : block.blockType;
          chapters.push(`${segs.join(':')} ${label}`);
        }
        lastBlockType = block.blockType;
      });
      if (!chapters.length) {
        // fallback: first block of each blockType change
        let prev = '';
        script.forEach(block => {
          if (block.blockType !== prev) {
            const tc = block.timecode.split(/\s*[-–]\s*/)[0].trim();
            const segs = tc.split(':').map(s => s.padStart(2, '0'));
            chapters.push(`${segs.join(':')} ${block.blockType}`);
            prev = block.blockType;
          }
        });
      }
      // Ensure first chapter is 0:00
      if (chapters.length && !chapters[0].startsWith('00:00') && !chapters[0].startsWith('0:00')) {
        chapters.unshift('0:00 Introduction');
      }
      navigator.clipboard.writeText(chapters.join('\n'));
      setChaptersCopied(true);
      setTimeout(() => setChaptersCopied(false), 2000);
    } catch (e) {
      setExportError(`Chapters copy failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  // Convert MM:SS or HH:MM:SS to frame number at 25fps
  const tcToFrames = (tc: string): string => {
    const segs = tc.trim().split(':').map(Number);
    let h = 0, m = 0, s = 0;
    if (segs.length === 3) { [h, m, s] = segs; }
    else if (segs.length === 2) { [m, s] = segs; }
    const totalSec = h * 3600 + m * 60 + s;
    const frames = Math.round(totalSec * 25);
    const ff = frames % 25, ss = Math.floor(totalSec) % 60;
    const mm = Math.floor(totalSec / 60) % 60, hh = Math.floor(totalSec / 3600);
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}:${String(ff).padStart(2,'0')}`;
  };

  const DAVINCI_COLORS: Record<string, string> = {
    HOOK: 'Red', SALES: 'Orange', TRANSITION: 'Green', INTRO: 'Blue',
    BODY: 'Blue', OUTRO: 'Purple',
  };

  const handleExportAssets = () => {
    try {
      setExportError(null);
      const rows = script
        .filter(b => b.assetName)
        .map(b => {
          const safeName = `"${(b.assetName || '').replace(/"/g, '""')}"`;
          const safeUrl = `"${(b.assetUrl || '').replace(/"/g, '""')}"`;
          return `${b.timecode},${b.blockType},${safeName},${safeUrl}`;
        });
      if (!rows.length) { setExportError('No assets attached to any block.'); return; }
      const csv = ['Timecode,BlockType,AssetName,AssetPath', ...rows].join('\n');
      const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ASSETS_${safeFilename}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(`Assets export failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  // Group C: TTS helpers
  const ttsStop = () => {
    window.speechSynthesis.cancel();
    setTtsPlaying(false);
  };

  const ttsPlayFrom = (startIdx: number) => {
    window.speechSynthesis.cancel();
    setTtsBlock(startIdx);
    setTtsPlaying(true);
    const playNext = (idx: number) => {
      if (idx >= script.length) { setTtsPlaying(false); return; }
      const text = script[idx]?.audioScript;
      if (!text) { playNext(idx + 1); return; }
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = ttsRate;
      utt.lang = 'en-US';
      setTtsBlock(idx);
      utt.onend = () => playNext(idx + 1);
      utt.onerror = () => { setTtsPlaying(false); };
      window.speechSynthesis.speak(utt);
    };
    playNext(startIdx);
  };

  const handleExportDaVinciMarkers = () => {
    try {
      setExportError(null);
      const headers = '#,Record In,Record Out,Name,Notes,Color';
      const rows = script.map((block, i) => {
        const parts = block.timecode.split(/\s*[-–]\s*/);
        const tcIn = tcToFrames(parts[0] ?? '00:00');
        const tcOut = tcToFrames(parts[1] ?? parts[0] ?? '00:00');
        const color = DAVINCI_COLORS[block.blockType] ?? 'Blue';
        const notes = `"${block.audioScript.substring(0, 80).replace(/"/g, '""')}"`;
        return `${i + 1},${tcIn},${tcOut},${block.blockType},${notes},${color}`;
      });
      const csv = [headers, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DAVINCI_MARKERS_${safeFilename}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(`DaVinci export failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handleDownloadAll = async () => {
    try {
      setExportError(null);
      const zip = new JSZip();
      const fn = safeFilename;

      // script.docx
      const scriptDocChildren: Paragraph[] = [
        new Paragraph({ text: `SCRIPT: ${topic}`, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: `NARRATIVE.WAR V${APP_VERSION} // PRODUCTION SCRIPT`, bold: true })] }),
        new Paragraph({ text: `Generated: ${new Date().toLocaleString()}` }),
        new Paragraph({ text: '' }),
        new Paragraph({ text: 'FINAL SCRIPT', heading: HeadingLevel.HEADING_2 }),
      ];
      for (const block of script) {
        scriptDocChildren.push(
          new Paragraph({ children: [new TextRun({ text: `${block.timecode}  [${block.blockType}]`, bold: true, color: 'CC0000' })] }),
          new Paragraph({ children: [new TextRun({ text: `VISUAL: ${block.visualCue}`, italics: true, color: '000099' })] }),
          new Paragraph({ children: [new TextRun({ text: `AUDIO (EN): ${block.audioScript}`, bold: true })] }),
          new Paragraph({ text: `AUDIO (RU): ${block.russianScript || ''}` }),
          new Paragraph({ text: '──────────────────────────────────────────────' }),
        );
      }
      const scriptDoc = new Document({ sections: [{ children: scriptDocChildren }] });
      zip.file(`SCRIPT_${fn}.docx`, await Packer.toBlob(scriptDoc));

      // script.json
      zip.file(`SCRIPT_${fn}.json`, JSON.stringify(script, null, 2));

      // script.csv
      const csvHeader = 'Timecode,BlockType,Visual,Audio (EN),Audio (RU)';
      const csvRows = script.map(b =>
        [b.timecode, b.blockType, b.visualCue, b.audioScript, b.russianScript || '']
          .map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',')
      );
      zip.file(`SCRIPT_${fn}.csv`, [csvHeader, ...csvRows].join('\n'));

      // SRT subtitles
      const buildSrt = (lang: 'en' | 'ru') =>
        script.map((b, i) => {
          const { start, end } = timecodeToSrt(b.timecode);
          const text = lang === 'en' ? b.audioScript : (b.russianScript || b.audioScript);
          return text?.trim() ? `${i + 1}\n${start} --> ${end}\n${text.trim()}` : null;
        }).filter(Boolean).join('\n\n');
      zip.file(`SUBTITLES_EN_${fn}.srt`, buildSrt('en'));
      zip.file(`SUBTITLES_RU_${fn}.srt`, buildSrt('ru'));

      // Research docs
      if (radarContent) zip.file(`RADAR_${fn}.txt`, radarContent);
      if (analystContent) zip.file(`DOSSIER_${fn}.txt`, typeof analystContent === 'string' ? analystContent : JSON.stringify(analystContent, null, 2));
      if (architectContent) zip.file(`BLUEPRINT_${fn}.txt`, architectContent);
      if (thumbnailConcept) zip.file(`THUMBNAIL_CONCEPT_${fn}.txt`, thumbnailConcept);
      if (seo) {
        zip.file(`SEO_${fn}.json`, JSON.stringify(seo, null, 2));
        const seoTxt = [
          '═══════════════════════════════════════',
          'TITLE OPTIONS',
          '═══════════════════════════════════════',
          ...seo.titles.map((t, i) => `${i + 1}. ${t}`),
          '',
          '═══════════════════════════════════════',
          'DESCRIPTION',
          '═══════════════════════════════════════',
          seo.description,
          '',
          '═══════════════════════════════════════',
          'TAGS',
          '═══════════════════════════════════════',
          seo.tags,
          '',
          '═══════════════════════════════════════',
          'PINNED COMMENT',
          '═══════════════════════════════════════',
          seo.firstComment,
          '',
          '═══════════════════════════════════════',
          'END SCREEN SCRIPT',
          '═══════════════════════════════════════',
          seo.endScreenScript,
        ].join('\n');
        zip.file(`SEO_PACKAGE_${fn}.txt`, '\ufeff' + seoTxt);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fn}_package.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(`Download All failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  return (
    <>
      {/* Lightbox Modal for Image Viewing */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-7xl max-h-[90vh] flex flex-col items-center">
            {/* CLOSE BUTTON */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImage(null);
              }}
              className="absolute -top-12 right-0 sm:-right-12 p-2 text-mw-slate hover:text-mw-red transition-colors bg-black/50 rounded-full sm:bg-transparent"
              title="Close Image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            <img
              src={selectedImage}
              alt="Full Size Storyboard"
              className="max-w-full max-h-[85vh] rounded border border-mw-red/50 shadow-[0_0_50px_rgba(220,38,38,0.3)] object-contain"
            />
            <div className="mt-4 text-white text-xs font-mono opacity-70 bg-black/50 px-3 py-1 rounded">
              CLICK ANYWHERE TO CLOSE
            </div>
          </div>
        </div>
      )}

      <div className="bg-mw-gray/20 rounded-lg overflow-hidden border border-mw-slate/30">
        <div className="bg-mw-red/10 border-b border-mw-red/30 p-4 flex flex-col gap-3">
          {/* Title row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-mw-red uppercase tracking-wider">
                Final Generated Script
              </h2>
              <p className="text-xs text-mw-slate mt-1 font-mono">
                NARRATIVE.WAR V{APP_VERSION} // {script.length} BLOCKS // ~{estMinutes} MIN ({totalAudioChars.toLocaleString()} CHARS)
                {totalAudioChars < MIN_AUDIO_CHARS && (
                  <span className="text-yellow-400 ml-2">⚠ SHORT (min {MIN_AUDIO_CHARS.toLocaleString()})</span>
                )}
              </p>
            </div>

            {/* Undo / Redo */}
            {dispatch && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => dispatch({ type: 'UNDO_SCRIPT' })}
                  disabled={!undoStack?.length}
                  title="Undo (Ctrl+Z)"
                  className="px-2 py-1.5 text-[10px] font-mono uppercase rounded border border-mw-slate/30 text-mw-slate hover:border-white hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ↺ Undo{undoStack?.length ? ` (${undoStack.length})` : ''}
                </button>
                <button
                  onClick={() => dispatch({ type: 'REDO_SCRIPT' })}
                  disabled={!redoStack?.length}
                  title="Redo (Ctrl+Y)"
                  className="px-2 py-1.5 text-[10px] font-mono uppercase rounded border border-mw-slate/30 text-mw-slate hover:border-white hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ↻ Redo{redoStack?.length ? ` (${redoStack.length})` : ''}
                </button>
              </div>
            )}

            {/* Generate All Images */}
            {onGenerateImage && (
              <button
                onClick={handleGenAllImages}
                disabled={generatingAll || script.every(b => b.imageUrl)}
                className="flex items-center gap-2 px-4 py-2 bg-orange-900/40 hover:bg-orange-800/60 border border-orange-500/30 text-orange-200 rounded text-xs uppercase font-bold tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {generatingAll
                  ? `Generating... (${script.filter(b => b.imageUrl).length}/${script.length})`
                  : `⚡ Gen All Images (${script.filter(b => !b.imageUrl).length} left)`
                }
              </button>
            )}
          </div>

          {/* Export buttons row */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExportDossierOnly}
              className="flex items-center gap-2 px-4 py-2 bg-blue-900/40 hover:bg-blue-800/60 border border-blue-500/30 text-blue-200 rounded text-xs uppercase font-bold tracking-wider transition-colors"
            >
              Dossier Only (.docx)
            </button>
            <button
              onClick={handleExportScriptOnly}
              className="flex items-center gap-2 px-4 py-2 bg-purple-900/40 hover:bg-purple-800/60 border border-purple-500/30 text-purple-200 rounded text-xs uppercase font-bold tracking-wider transition-colors"
            >
              Script Only (.docx)
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-green-900/40 hover:bg-green-800/60 border border-green-500/30 text-green-200 rounded text-xs uppercase font-bold tracking-wider transition-colors"
            >
              Editor Task (.csv)
            </button>
            <button
              onClick={() => handleExportSRT('en')}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-900/40 hover:bg-yellow-800/60 border border-yellow-500/30 text-yellow-200 rounded text-xs uppercase font-bold tracking-wider transition-colors"
            >
              SRT EN (.srt)
            </button>
            <button
              onClick={() => handleExportSRT('ru')}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-900/40 hover:bg-yellow-800/60 border border-yellow-500/30 text-yellow-200 rounded text-xs uppercase font-bold tracking-wider transition-colors"
            >
              SRT RU (.srt)
            </button>
            <button
              onClick={handleExportShotList}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-500/30 text-cyan-200 rounded text-xs uppercase font-bold tracking-wider transition-colors"
            >
              Shot List (.docx)
            </button>
            <button
              onClick={handleCopyChapters}
              className="flex items-center gap-2 px-4 py-2 bg-teal-900/40 hover:bg-teal-800/60 border border-teal-500/30 text-teal-200 rounded text-xs uppercase font-bold tracking-wider transition-colors"
            >
              {chaptersCopied ? '✓ Copied!' : 'YT Chapters (copy)'}
            </button>
            <button
              onClick={handleExportDaVinciMarkers}
              className="flex items-center gap-2 px-4 py-2 bg-rose-900/40 hover:bg-rose-800/60 border border-rose-500/30 text-rose-200 rounded text-xs uppercase font-bold tracking-wider transition-colors"
            >
              DaVinci Markers (.csv)
            </button>
            {dispatch && (
              <button
                onClick={handleExportAssets}
                className="flex items-center gap-2 px-4 py-2 bg-orange-900/40 hover:bg-orange-800/60 border border-orange-500/30 text-orange-200 rounded text-xs uppercase font-bold tracking-wider transition-colors"
              >
                Assets (.csv)
              </button>
            )}
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(script, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `SCRIPT_${safeFilename}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-900/40 hover:bg-indigo-800/60 border border-indigo-500/30 text-indigo-200 rounded text-xs uppercase font-bold tracking-wider transition-colors"
            >
              Script (.json)
            </button>
            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-500/50 text-cyan-200 rounded text-xs uppercase font-bold tracking-wider transition-colors"
            >
              ⬇ Download All (.zip)
            </button>
            {dispatch && (
              <button
                onClick={() => {
                  const retimed = calculateDurationAndRetiming(script);
                  dispatch({ type: 'MERGE', partial: { finalScript: retimed } });
                }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-500/30 text-slate-300 rounded text-xs uppercase font-bold tracking-wider transition-colors"
                title="Recalculate all timecodes from audioScript lengths"
              >
                ⏱ Recalc Timecodes
              </button>
            )}
          </div>

          {/* Export error */}
          {exportError && (
            <p className="text-red-400 text-xs font-mono border border-red-500/30 bg-red-900/20 px-3 py-1 rounded">
              ✕ {exportError}
            </p>
          )}

          {/* Search & Filter row */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
              placeholder="Search script..."
              className="flex-1 min-w-[180px] px-3 py-1.5 bg-black/40 border border-mw-slate/40 rounded text-xs font-mono text-white placeholder-mw-slate/50 focus:outline-none focus:border-mw-red/60"
            />
            {(['ALL', 'HOOK', 'INTRO', 'BODY', 'TRANSITION', 'SALES', 'OUTRO'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setFilterType(t); setPage(0); }}
                className={`px-2 py-1 text-[10px] font-mono uppercase rounded border transition-all ${filterType === t ? 'border-mw-red text-mw-red bg-mw-red/10' : 'border-mw-slate/30 text-mw-slate hover:border-mw-red/60 hover:text-white'}`}
              >
                {t}
              </button>
            ))}
            <span className="text-[10px] text-mw-slate font-mono ml-auto">
              {filteredBlocks.length}/{script.length} blocks
            </span>
            <button
              onClick={() => setShowTranslationIssues(v => !v)}
              className={`px-3 py-1 text-[10px] font-mono uppercase rounded border transition-all ${showTranslationIssues ? 'border-yellow-400 text-yellow-300 bg-yellow-900/20' : 'border-mw-slate/30 text-mw-slate hover:border-yellow-400/60'}`}
            >
              Translation Issues
            </button>
            <button
              onClick={() => setShowAudit(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-mono uppercase rounded border transition-all ${showAudit ? 'border-mw-red text-mw-red bg-mw-red/10' : 'border-mw-slate/30 text-mw-slate hover:border-mw-red/60'}`}
            >
              Audit
              {auditWarningCount > 0 && (
                <span className="px-1.5 py-0.5 bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 rounded text-[9px] font-bold leading-none">
                  {auditWarningCount}
                </span>
              )}
            </button>
            {(() => {
              const assetCount = script.filter(b => b.assetName).length;
              return assetCount > 0 ? (
                <button
                  onClick={() => setShowAssetLibrary(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-mono uppercase rounded border transition-all ${showAssetLibrary ? 'border-orange-400 text-orange-300 bg-orange-900/20' : 'border-mw-slate/30 text-mw-slate hover:border-orange-400/60'}`}
                >
                  Assets
                  <span className="px-1.5 py-0.5 bg-orange-500/20 border border-orange-500/50 text-orange-300 rounded text-[9px] font-bold leading-none">{assetCount}</span>
                </button>
              ) : null;
            })()}
          </div>

          {/* TTS Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-mw-slate font-mono uppercase tracking-wider">Listen:</span>
            <button
              onClick={() => ttsPlaying ? ttsStop() : ttsPlayFrom(ttsBlock)}
              className={`px-3 py-1 text-[10px] font-mono uppercase rounded border transition-all ${ttsPlaying ? 'border-mw-red text-mw-red bg-mw-red/10' : 'border-mw-slate/30 text-mw-slate hover:border-white hover:text-white'}`}
            >
              {ttsPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <button
              onClick={ttsStop}
              disabled={!ttsPlaying}
              className="px-3 py-1 text-[10px] font-mono uppercase rounded border border-mw-slate/30 text-mw-slate hover:border-white hover:text-white transition-all disabled:opacity-30"
            >
              ■ Stop
            </button>
            <button
              onClick={() => ttsPlayFrom(Math.max(0, ttsBlock - 1))}
              className="px-3 py-1 text-[10px] font-mono uppercase rounded border border-mw-slate/30 text-mw-slate hover:border-white hover:text-white transition-all"
            >
              ← Prev
            </button>
            <button
              onClick={() => ttsPlayFrom(Math.min(script.length - 1, ttsBlock + 1))}
              className="px-3 py-1 text-[10px] font-mono uppercase rounded border border-mw-slate/30 text-mw-slate hover:border-white hover:text-white transition-all"
            >
              Next →
            </button>
            <span className="text-[10px] text-mw-slate font-mono">Speed:</span>
            {([0.75, 1, 1.25] as const).map(r => (
              <button
                key={r}
                onClick={() => setTtsRate(r)}
                className={`px-2 py-1 text-[10px] font-mono rounded border transition-all ${ttsRate === r ? 'border-mw-red text-mw-red bg-mw-red/10' : 'border-mw-slate/30 text-mw-slate hover:border-white hover:text-white'}`}
              >
                {r}x
              </button>
            ))}
            {ttsPlaying && (
              <span className="text-[10px] text-mw-red font-mono animate-pulse">
                Block {ttsBlock + 1}/{script.length}
              </span>
            )}
          </div>

          {/* Audit Panel */}
          {showAudit && (() => {
            const BLACKLIST = DEMONETIZATION_BLACKLIST;
            const auditIssues: { type: 'warn' | 'ok'; msg: string }[] = [];
            const allText = script.map(b => (b.audioScript || '')).join(' ').toLowerCase();
            const foundBlacklist = BLACKLIST.filter(w => allText.includes(w));
            if (foundBlacklist.length) auditIssues.push({ type: 'warn', msg: `Blacklisted words: ${foundBlacklist.join(', ')}` });
            const shortBlocks = script.filter(b => (b.audioScript || '').split(/\s+/).filter(Boolean).length < 30);
            if (shortBlocks.length) auditIssues.push({ type: 'warn', msg: `${shortBlocks.length} block(s) with < 30 words` });
            if (script[0]?.blockType !== 'HOOK') auditIssues.push({ type: 'warn', msg: 'First block is not HOOK' });
            if (script[script.length - 1]?.blockType !== 'OUTRO') auditIssues.push({ type: 'warn', msg: 'Last block is not OUTRO' });
            const maxSales = projectType === 'documentary' ? 4 : 1;
            const salesCount = script.filter(b => b.blockType === 'SALES').length;
            if (salesCount === 0) auditIssues.push({ type: 'warn', msg: 'No SALES blocks' });
            if (salesCount > maxSales) auditIssues.push({ type: 'warn', msg: `${salesCount} SALES blocks (max ${maxSales})` });
            let maxRun = 0, curRun = 1;
            for (let i = 1; i < script.length; i++) {
              if (script[i].blockType === script[i-1].blockType) { curRun++; maxRun = Math.max(maxRun, curRun); } else { curRun = 1; }
            }
            if (maxRun > 4) auditIssues.push({ type: 'warn', msg: `${maxRun} consecutive identical block types` });
            const estMin = parseFloat(estMinutes);
            const cfg = PROJECT_CONFIGS[projectType];
            const minDur = cfg.minChars / (CHARS_PER_SECOND * 60);
            const maxDur = projectType === 'documentary' ? 9999 : 20;
            if (estMin >= minDur && estMin <= maxDur) auditIssues.push({ type: 'ok', msg: `Duration ${estMinutes} min — OK` });
            else auditIssues.push({ type: 'warn', msg: `Duration ${estMinutes} min — out of ${cfg.description} target` });
            auditIssues.push({ type: 'ok', msg: `${script.length} total blocks` });
            if (!foundBlacklist.length) auditIssues.push({ type: 'ok', msg: 'No blacklisted words' });
            const warnCount = auditIssues.filter(i => i.type === 'warn').length;
            return (
              <div className="bg-black/30 border border-mw-slate/20 rounded p-3 flex flex-col gap-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-bold text-mw-slate uppercase tracking-wider">Script Audit</div>
                  {warnCount > 0
                    ? <span className="text-[10px] font-bold text-yellow-300 font-mono">{warnCount} violation{warnCount !== 1 ? 's' : ''} found</span>
                    : <span className="text-[10px] font-bold text-green-400 font-mono">All checks passed</span>
                  }
                </div>
                {auditIssues.map((issue, i) => (
                  <div key={i} className={`text-xs font-mono ${issue.type === 'warn' ? 'text-yellow-300' : 'text-green-400'}`}>
                    {issue.type === 'warn' ? '⚠' : '✓'} {issue.msg}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Asset Library */}
          {showAssetLibrary && (() => {
            const assetsBlocks = script.map((b, i) => ({ block: b, idx: i })).filter(({ block }) => block.assetName);
            return (
              <div className="bg-black/30 border border-orange-500/20 rounded p-3">
                <div className="text-[10px] font-bold text-orange-300/70 uppercase tracking-wider mb-3">
                  Asset Library — {assetsBlocks.length} attached
                </div>
                <div className="flex flex-wrap gap-3">
                  {assetsBlocks.map(({ block, idx }) => (
                    <div key={idx} className="flex flex-col gap-1 border border-mw-slate/20 rounded p-2 bg-black/20 w-36">
                      {block.assetUrl && block.assetName?.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? (
                        <img src={block.assetUrl} alt={block.assetName} className="w-full h-20 object-cover rounded border border-mw-slate/20" />
                      ) : (
                        <div className="w-full h-20 flex items-center justify-center bg-mw-slate/10 rounded border border-mw-slate/20">
                          <span className="text-2xl">📎</span>
                        </div>
                      )}
                      <span className="text-[10px] text-mw-slate font-mono truncate" title={block.assetName}>{block.assetName}</span>
                      <span className="text-[10px] text-mw-slate/50 font-mono">Block #{idx + 1} — {block.blockType}</span>
                      {dispatch && (
                        <button
                          onClick={() => dispatch({ type: 'UPDATE_SCRIPT_BLOCK', index: idx, patch: { assetUrl: undefined, assetName: undefined } })}
                          className="text-[10px] text-red-400/70 hover:text-red-300 text-left transition-all"
                        >
                          ✕ Detach
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-mw-slate/20 bg-black/20">
            <span className="text-xs text-mw-slate font-mono">
              Blocks {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredBlocks.length)} of {filteredBlocks.length}{filteredBlocks.length !== script.length ? ` (filtered from ${script.length})` : ''}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-xs font-mono border border-mw-slate/40 rounded text-mw-slate hover:border-mw-red hover:text-mw-red transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`px-3 py-1 text-xs font-mono border rounded transition-all ${i === page ? 'border-mw-red text-mw-red bg-mw-red/10' : 'border-mw-slate/40 text-mw-slate hover:border-mw-red hover:text-mw-red'}`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="px-3 py-1 text-xs font-mono border border-mw-slate/40 rounded text-mw-slate hover:border-mw-red hover:text-mw-red transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        <div ref={tableRef} className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-mw-black text-xs uppercase tracking-wider text-mw-slate border-b border-mw-slate/50">
                <th className="p-4 w-28">Timing</th>
                <th className="p-4 w-1/4">Visual (AI Storyboard)</th>
                <th className="p-4 w-2/3">Audio (EN)</th>
                {showRu && <th className="p-4 w-1/3">Audio (RU)</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-mw-slate/20 font-mono text-sm">
              {visibleBlocks.map(({ block, globalIdx }) => {
                const enWords = (block.audioScript || '').split(/\s+/).filter(Boolean).length;
                const ruWords = (block.russianScript || '').split(/\s+/).filter(Boolean).length;
                const translationRatio = enWords > 0 ? ruWords / enWords : 1;
                const hasTranslationIssue = showTranslationIssues && enWords > 0 && translationRatio < 0.6;
                return (
                  <tr key={globalIdx} className={`hover:bg-mw-slate/5 transition-colors ${ttsPlaying && ttsBlock === globalIdx ? 'bg-mw-red/10 border-l-2 border-mw-red' : ''} ${hasTranslationIssue ? 'bg-yellow-900/10' : ''}`}>
                    <td className="p-4 align-top text-mw-red font-bold whitespace-nowrap">
                      {block.timecode}
                      <div className="text-[10px] text-mw-slate mt-1 border border-mw-slate/30 rounded px-1 inline-block">
                        {block.blockType}
                      </div>
                      {dispatch && (
                        <div className="flex flex-col gap-0.5 mt-2">
                          <button onClick={() => dispatch({ type: 'MOVE_SCRIPT_BLOCK', from: globalIdx, to: Math.max(0, globalIdx - 1) })} disabled={globalIdx === 0} className="text-[10px] text-mw-slate hover:text-white transition-all disabled:opacity-20">↑</button>
                          <button onClick={() => dispatch({ type: 'MOVE_SCRIPT_BLOCK', from: globalIdx, to: Math.min(script.length - 1, globalIdx + 1) })} disabled={globalIdx === script.length - 1} className="text-[10px] text-mw-slate hover:text-white transition-all disabled:opacity-20">↓</button>
                          <button onClick={() => dispatch({ type: 'ADD_SCRIPT_BLOCK', index: globalIdx })} className="text-[10px] text-green-500 hover:text-green-300 transition-all mt-1" title="Add block below">+</button>
                          <button onClick={() => { if (window.confirm('Delete this block?')) dispatch({ type: 'DELETE_SCRIPT_BLOCK', index: globalIdx }); }} className="text-[10px] text-red-500 hover:text-red-300 transition-all" title="Delete block">✕</button>
                        </div>
                      )}
                    </td>
                    <td className="p-4 align-top text-blue-200/90 text-xs">
                      <div className="mb-2 italic">{highlightText(block.visualCue, searchQuery)}</div>
                      <div className="flex gap-1 mb-2">
                        {(() => {
                          const query = encodeURIComponent(
                            block.visualCue.replace(/^\[[^\]]+\]\s*/, '').substring(0, 60)
                          );
                          return (
                            <>
                              <a
                                href={`https://www.pexels.com/search/videos/${query}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] px-2 py-0.5 rounded border border-teal-500/30 text-teal-400 hover:bg-teal-900/30 transition-all"
                              >
                                Pexels
                              </a>
                              <a
                                href={`https://pixabay.com/videos/search/${query}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] px-2 py-0.5 rounded border border-teal-500/30 text-teal-400 hover:bg-teal-900/30 transition-all"
                              >
                                Pixabay
                              </a>
                            </>
                          );
                        })()}</div>

                      {block.imageUrl ? (
                        <div className="mt-2 rounded overflow-hidden border border-mw-slate/50 relative group">
                          <img
                            src={block.imageUrl}
                            alt="Storyboard"
                            className="w-full h-auto object-cover cursor-zoom-in hover:brightness-110 transition-all"
                            onClick={() => setSelectedImage(block.imageUrl || null)}
                          />
                          <button
                            onClick={() => handleGenImage(globalIdx)}
                            className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Regenerate
                          </button>
                        </div>
                      ) : (
                        onGenerateImage && (
                          <button
                            onClick={() => handleGenImage(globalIdx)}
                            disabled={loadingImages.includes(globalIdx)}
                            className="mt-2 text-[10px] flex items-center gap-2 border border-mw-slate/30 px-2 py-1 rounded text-mw-slate hover:text-white hover:border-white transition-all w-full justify-center"
                          >
                            {loadingImages.includes(globalIdx) ? (
                              <span className="animate-pulse">GENERATING...</span>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                GEN STORYBOARD
                              </>
                            )}
                          </button>
                        )
                      )}
                    </td>
                    <td className="p-4 align-top text-gray-300 leading-relaxed">
                      {dispatch && editingCell?.idx === globalIdx ? (
                        <div className="flex flex-col gap-1">
                          <textarea
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            className="w-full bg-black/60 border border-mw-red/50 rounded p-2 text-xs font-mono text-gray-200 resize-y min-h-[80px] focus:outline-none"
                          />
                          <div className="flex gap-1">
                            <button onClick={() => {
                              const changed = editValue !== block.audioScript;
                              dispatch({ type: 'UPDATE_SCRIPT_BLOCK', index: globalIdx, patch: {
                                audioScript: editValue,
                                ...(changed && block.russianScript ? { ruStale: true } : {}),
                              }});
                              setEditingCell(null);
                            }} className="text-[10px] px-2 py-0.5 rounded bg-mw-red/20 border border-mw-red/40 text-white hover:bg-mw-red/40 transition-all">Save</button>
                            <button onClick={() => setEditingCell(null)} className="text-[10px] px-2 py-0.5 rounded border border-mw-slate/30 text-mw-slate hover:text-white transition-all">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`italic cursor-pointer group relative ${dispatch ? 'hover:bg-white/5 rounded px-1' : ''}`}
                          onClick={() => dispatch && (setEditingCell({ idx: globalIdx, field: 'audioScript' }), setEditValue(block.audioScript))}
                        >
                          "{highlightText(block.audioScript, searchQuery)}"
                          {dispatch && <span className="absolute top-0 right-0 text-[9px] text-mw-slate/50 opacity-0 group-hover:opacity-100">edit</span>}
                        </div>
                      )}
                      {/* Stale RU indicator + translate button */}
                      {dispatch && block.ruStale && block.russianScript && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-[10px] text-yellow-400 font-mono">⚠ RU outdated</span>
                          <button
                            disabled={translatingBlocks.includes(globalIdx)}
                            onClick={async () => {
                              setTranslatingBlocks(prev => [...prev, globalIdx]);
                              const ru = await translateBlockToRussian(block.audioScript);
                              if (ru) {
                                dispatch({ type: 'UPDATE_SCRIPT_BLOCK', index: globalIdx, patch: { russianScript: ru, ruStale: false } });
                              }
                              setTranslatingBlocks(prev => prev.filter(i => i !== globalIdx));
                            }}
                            className="text-[10px] px-2 py-0.5 rounded border border-yellow-500/40 text-yellow-300 hover:bg-yellow-900/20 transition-all disabled:opacity-40"
                          >
                            {translatingBlocks.includes(globalIdx) ? '…translating' : '↻ Translate RU'}
                          </button>
                        </div>
                      )}
                      {/* Asset attachment */}
                      {dispatch && (
                        <div className="mt-2">
                          {block.assetName ? (
                            <div className="flex items-center gap-1">
                              {block.assetUrl && block.assetName?.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? (
                                <img src={block.assetUrl} alt={block.assetName} className="h-10 rounded border border-mw-slate/30 object-cover" />
                              ) : (
                                <span className="text-[10px] text-mw-slate font-mono truncate max-w-[120px]">{block.assetName}</span>
                              )}
                              <button onClick={() => dispatch({ type: 'UPDATE_SCRIPT_BLOCK', index: globalIdx, patch: { assetUrl: undefined, assetName: undefined } })} className="text-[10px] text-red-400 hover:text-red-300">✕</button>
                            </div>
                          ) : (
                            <label className="cursor-pointer text-[10px] text-mw-slate/60 hover:text-mw-slate transition-all border border-dashed border-mw-slate/20 rounded px-2 py-0.5">
                              + Attach
                              <input type="file" className="hidden" onChange={e => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const url = URL.createObjectURL(file);
                                dispatch({ type: 'UPDATE_SCRIPT_BLOCK', index: globalIdx, patch: { assetUrl: url, assetName: file.name } });
                              }} />
                            </label>
                          )}
                        </div>
                      )}
                    </td>
                    {showRu && (
                      <td className="p-4 align-top text-gray-400 leading-relaxed italic border-l border-mw-slate/10">
                        "{block.russianScript}"
                        {hasTranslationIssue && (
                          <span className="ml-2 text-yellow-400 text-[10px] font-bold not-italic">
                            ⚠ {Math.round(translationRatio * 100)}%
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default ScriptDisplay;
