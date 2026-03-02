
import React, { memo, useEffect, useRef } from 'react';

interface AgentLogProps {
  logs: string[];
}

const AgentLog: React.FC<AgentLogProps> = memo(({ logs }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Per-instance timestamp map — not module-level, so it gets GC'd with the component.
  // Entries for trimmed log lines are cleaned up in the effect below.
  const timestampRef = useRef<Map<number, string>>(new Map());
  // When user hovers, auto-scroll pauses so they can read back through history.
  const isPausedRef = useRef(false);

  useEffect(() => {
    for (const key of timestampRef.current.keys()) {
      if (key >= logs.length) timestampRef.current.delete(key);
    }
    if (!isPausedRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const getTimestamp = (index: number): string => {
    if (!timestampRef.current.has(index)) {
      timestampRef.current.set(index, new Date().toLocaleTimeString());
    }
    return timestampRef.current.get(index)!;
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => { isPausedRef.current = true; }}
      onMouseLeave={() => {
        isPausedRef.current = false;
        if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }}
      className="bg-black border border-mw-slate/50 p-4 h-64 overflow-y-auto font-mono text-xs sm:text-sm shadow-inner shadow-black opacity-90"
    >
      <div className="mb-2 text-mw-red font-bold uppercase tracking-widest border-b border-mw-red/30 pb-1 flex items-center justify-between">
        <span>System Kernel Log</span>
        <span className="text-mw-slate/40 text-[10px] normal-case tracking-normal font-normal">hover to pause</span>
      </div>
      <div className="flex flex-col space-y-1">
        {logs.map((log, i) => (
          <div key={i} className="text-green-500 break-words">
            <span className="text-mw-slate mr-2">[{getTimestamp(i)}]</span>
            {log}
          </div>
        ))}
      </div>
    </div>
  );
});

AgentLog.displayName = 'AgentLog';

export default AgentLog;
