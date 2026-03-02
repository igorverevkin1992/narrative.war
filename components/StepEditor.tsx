import React, { memo } from 'react';

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

const StepEditor: React.FC<StepEditorProps> = memo(({
  value,
  originalValue,
  onChange,
  onApprove,
  approveLabel,
  borderColor,
  textColor,
  height = 'h-96',
}) => (
  <div>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full ${height} bg-black border ${borderColor} ${textColor} font-mono text-sm p-4 focus:outline-none leading-relaxed resize-y`}
    />
    <div className="mt-4 flex items-center justify-between">
      {originalValue !== undefined ? (
        <button
          onClick={() => onChange(originalValue)}
          disabled={value === originalValue}
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
));

StepEditor.displayName = 'StepEditor';

export default StepEditor;
