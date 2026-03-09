import React, { memo, useState, useMemo } from 'react';

interface StepEditorProps {
  value: string;
  originalValue?: string;
  onChange: (value: string) => void;
  onApprove: () => void;
  approveLabel: string;
  borderColor: string;
  textColor: string;
  height?: string;
}

type DiffRow = {
  type: 'same' | 'changed' | 'added' | 'removed';
  origLine: string;
  currLine: string;
};

function computeDiff(original: string, current: string): DiffRow[] {
  const origLines = original.split('\n');
  const currLines = current.split('\n');
  const maxLen = Math.max(origLines.length, currLines.length);
  return Array.from({ length: maxLen }, (_, i) => {
    const o = origLines[i];
    const c = currLines[i];
    if (o === undefined) return { type: 'added',   origLine: '',  currLine: c };
    if (c === undefined) return { type: 'removed', origLine: o,  currLine: '' };
    if (o === c)         return { type: 'same',    origLine: o,  currLine: c };
    return               { type: 'changed', origLine: o,  currLine: c };
  });
}

const StepEditor: React.FC<StepEditorProps> = memo(({
  value,
  originalValue,
  onChange,
  onApprove,
  approveLabel,
  borderColor,
  textColor,
  height = 'h-96',
}) => {
  const [showDiff, setShowDiff] = useState(false);

  const hasChanges = originalValue !== undefined && value !== originalValue;
  const diffRows = useMemo(
    () => (showDiff && originalValue !== undefined ? computeDiff(originalValue, value) : []),
    [showDiff, originalValue, value]
  );

  const changedCount = useMemo(
    () => diffRows.filter(r => r.type !== 'same').length,
    [diffRows]
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-2">
        {originalValue !== undefined && hasChanges && (
          <button
            onClick={() => setShowDiff(v => !v)}
            className={`font-mono text-xs border px-3 py-1.5 rounded transition-all ${
              showDiff
                ? 'border-cyan-500/60 text-cyan-300 bg-cyan-900/20'
                : 'border-mw-slate/40 text-mw-slate hover:text-white hover:border-white'
            }`}
          >
            {showDiff ? `▼ Hide Diff (${changedCount} changes)` : `▶ Show Diff (${changedCount > 0 ? changedCount : '…'} changes)`}
          </button>
        )}
        {!hasChanges && originalValue !== undefined && (
          <span className="font-mono text-xs text-mw-slate/50">No changes</span>
        )}
      </div>

      {/* Diff view */}
      {showDiff && diffRows.length > 0 ? (
        <div className="grid grid-cols-2 gap-0 border border-mw-slate/30 rounded overflow-hidden font-mono text-xs leading-5">
          {/* Column headers */}
          <div className="bg-red-900/20 border-b border-mw-slate/30 px-3 py-1.5 text-[10px] text-red-300/70 uppercase tracking-wider">
            Original
          </div>
          <div className="bg-green-900/20 border-b border-l border-mw-slate/30 px-3 py-1.5 text-[10px] text-green-300/70 uppercase tracking-wider">
            Edited
          </div>

          {/* Diff rows */}
          {diffRows.map((row, i) => (
            <React.Fragment key={i}>
              {/* Original side */}
              <div className={`px-3 py-0.5 whitespace-pre-wrap break-words border-r border-mw-slate/20 ${
                row.type === 'removed' ? 'bg-red-900/30 text-red-200' :
                row.type === 'changed' ? 'bg-red-900/20 text-red-200/80' :
                row.type === 'added'   ? 'bg-black/20 text-mw-slate/30' :
                'text-slate-400'
              }`}>
                {row.type === 'removed' ? <span className="text-red-400/60 mr-1 select-none">−</span> :
                 row.type === 'changed' ? <span className="text-red-400/60 mr-1 select-none">~</span> :
                 row.type === 'added'   ? <span className="text-mw-slate/20 mr-1 select-none"> </span> :
                                          <span className="text-mw-slate/20 mr-1 select-none"> </span>}
                {row.origLine || '\u00a0'}
              </div>
              {/* Edited side */}
              <div className={`px-3 py-0.5 whitespace-pre-wrap break-words ${
                row.type === 'added'   ? 'bg-green-900/30 text-green-200' :
                row.type === 'changed' ? 'bg-green-900/20 text-green-200/80' :
                row.type === 'removed' ? 'bg-black/20 text-mw-slate/30' :
                'text-slate-400'
              }`}>
                {row.type === 'added'   ? <span className="text-green-400/60 mr-1 select-none">+</span> :
                 row.type === 'changed' ? <span className="text-green-400/60 mr-1 select-none">~</span> :
                 row.type === 'removed' ? <span className="text-mw-slate/20 mr-1 select-none"> </span> :
                                          <span className="text-mw-slate/20 mr-1 select-none"> </span>}
                {row.currLine || '\u00a0'}
              </div>
            </React.Fragment>
          ))}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full ${height} bg-black border ${borderColor} ${textColor} font-mono text-sm p-4 focus:outline-none leading-relaxed resize-y`}
        />
      )}

      <div className="mt-4 flex items-center justify-between">
        {originalValue !== undefined ? (
          <button
            onClick={() => { onChange(originalValue); setShowDiff(false); }}
            disabled={!hasChanges}
            className="font-mono text-xs border border-mw-slate/40 px-3 py-2 rounded text-mw-slate hover:text-white hover:border-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            title="Revert to original agent output"
          >
            ↩ Revert
          </button>
        ) : <span />}
        <button
          onClick={onApprove}
          className="bg-mw-red text-white px-6 py-2 rounded font-bold uppercase tracking-wider text-xs hover:bg-red-600 transition-colors"
        >
          {approveLabel}
        </button>
      </div>
    </div>
  );
});

StepEditor.displayName = 'StepEditor';

export default StepEditor;
