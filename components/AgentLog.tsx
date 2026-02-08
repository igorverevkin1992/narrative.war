
import React, { useEffect, useRef } from 'react';

interface AgentLogProps {
  logs: string[];
}

const AgentLog: React.FC<AgentLogProps> = ({ logs }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Use scrollTop instead of scrollIntoView to prevent the main window from scrolling up
  // when a log is added while the user is at the bottom of the page.
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div 
      ref={containerRef}
      className="bg-black border border-mw-slate/50 p-4 h-64 overflow-y-auto font-mono text-xs sm:text-sm shadow-inner shadow-black opacity-90"
    >
      <div className="mb-2 text-mw-red font-bold uppercase tracking-widest border-b border-mw-red/30 pb-1">
        System Kernel Log
      </div>
      <div className="flex flex-col space-y-1">
        {logs.map((log, i) => (
          <div key={i} className="text-green-500 break-words">
            <span className="text-mw-slate mr-2">[{new Date().toLocaleTimeString()}]</span>
            {log}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgentLog;
