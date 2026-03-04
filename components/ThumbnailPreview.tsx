import React, { useRef, useState, useCallback } from 'react';

interface ThumbnailPreviewProps {
  thumbnailConcept: string;
  previewImageUrl?: string;
  isProcessing: boolean;
  onGenerate: (referenceBase64: string, mimeType: string) => void;
}

const ThumbnailPreview: React.FC<ThumbnailPreviewProps> = ({
  thumbnailConcept,
  previewImageUrl,
  isProcessing,
  onGenerate,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewRef, setPreviewRef] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      // dataUrl = "data:image/jpeg;base64,<data>"
      const [header, base64] = dataUrl.split(',');
      const mimeType = header.split(':')[1].split(';')[0];
      setPreviewRef({ base64, mimeType, name: file.name });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!previewRef || isGenerating || isProcessing) return;
    setIsGenerating(true);
    await onGenerate(previewRef.base64, previewRef.mimeType);
    setIsGenerating(false);
  }, [previewRef, isGenerating, isProcessing, onGenerate]);

  const handleDownload = useCallback(() => {
    if (!previewImageUrl) return;
    const a = document.createElement('a');
    a.href = previewImageUrl;
    a.download = 'thumbnail-preview.jpg';
    a.click();
  }, [previewImageUrl]);

  const busy = isGenerating || isProcessing;

  return (
    <div className="bg-mw-gray/20 p-6 rounded border border-mw-slate/30">
      <h4 className="text-yellow-400 font-mono text-xs mb-3">/// THUMBNAIL_PREVIEW</h4>

      {/* Concept display */}
      <div className="mb-4 p-3 bg-black/30 border border-mw-slate/20 rounded">
        <div className="text-[10px] text-mw-slate uppercase tracking-wider mb-1 font-mono">Concept from Architect</div>
        <div className="text-sm text-mw-slate font-mono leading-relaxed">{thumbnailConcept}</div>
      </div>

      {/* Upload + generate controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 bg-mw-gray/40 hover:bg-mw-gray/60 border border-mw-slate/40 text-mw-slate hover:text-white rounded text-xs uppercase font-bold tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {previewRef ? previewRef.name : 'Upload Reference Image'}
        </button>

        <button
          onClick={handleGenerate}
          disabled={!previewRef || busy}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-900/40 hover:bg-yellow-800/60 border border-yellow-500/40 text-yellow-300 hover:text-yellow-100 rounded text-xs uppercase font-bold tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <span className="w-3 h-3 border border-yellow-400/60 border-t-yellow-400 rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
              Generate Preview
            </>
          )}
        </button>
      </div>

      {/* Result image */}
      {previewImageUrl && (
        <div className="space-y-3">
          <img
            src={previewImageUrl}
            alt="Generated thumbnail preview"
            className="w-full rounded border border-mw-slate/30 aspect-video object-cover"
          />
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-mw-gray/30 hover:bg-mw-gray/50 border border-mw-slate/30 text-mw-slate hover:text-white rounded text-xs uppercase font-bold tracking-wider transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Preview
          </button>
        </div>
      )}
    </div>
  );
};

export default ThumbnailPreview;
