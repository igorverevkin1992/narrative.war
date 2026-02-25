import React, { memo } from 'react';

interface StepEditorProps {
  value: string;
  onChange: (value: string) => void;
  onApprove: () => void;
  approveLabel: string;
  borderColor: string;
  textColor: string;
  height?: string;
}

const StepEditor: React.FC<StepEditorProps> = memo(({
  value,
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
    <div className="mt-4 flex justify-end">
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
