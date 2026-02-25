import React, { useEffect } from 'react';

interface ErrorToastProps {
  message: string;
  onClose: () => void;
}

const ErrorToast: React.FC<ErrorToastProps> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 7000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-[200] max-w-md bg-red-950 border border-mw-red rounded-lg p-4 shadow-[0_0_20px_rgba(220,38,38,0.4)] flex items-start gap-3 animate-in slide-in-from-right">
      <div className="w-2 h-2 bg-mw-red rounded-full mt-1.5 flex-shrink-0 animate-pulse" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold uppercase tracking-wider text-mw-red mb-1 font-mono">SYSTEM ERROR</div>
        <div className="text-sm text-red-200 font-mono break-words">{message}</div>
      </div>
      <button
        onClick={onClose}
        className="text-mw-slate hover:text-white transition-colors flex-shrink-0 mt-0.5"
        aria-label="Close error"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
};

export default ErrorToast;
