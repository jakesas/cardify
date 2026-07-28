import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Settings, CheckCircle2 } from 'lucide-react';

interface HeaderTimerProps {
  className?: string;
}

export const HeaderTimer = ({ className = '' }: HeaderTimerProps) => {
  const [duration, setDuration] = useState(() => {
    const saved = localStorage.getItem('ht_duration');
    return saved ? parseInt(saved, 10) : 25 * 60;
  });
  const [timeLeft, setTimeLeft] = useState(() => {
    const saved = localStorage.getItem('ht_timeleft');
    return saved ? parseInt(saved, 10) : 25 * 60;
  });
  const [isRunning, setIsRunning] = useState(() => {
    return localStorage.getItem('ht_running') === 'true';
  });
  const [showSettings, setShowSettings] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [completed, setCompleted] = useState(false);

  const settingsRef = useRef<HTMLDivElement>(null);
  const startWallRef = useRef<number>(0);
  const remainingAtStartRef = useRef<number>(0);

  // Restore timer that was running across page reload
  useEffect(() => {
    if (isRunning) {
      const savedStart = localStorage.getItem('ht_start');
      if (savedStart) {
        const elapsed = Math.floor((Date.now() - parseInt(savedStart, 10)) / 1000);
        const remaining = Math.max(0, timeLeft - elapsed);
        setTimeLeft(remaining);
        localStorage.setItem('ht_timeleft', String(remaining));
        if (remaining <= 0) {
          setIsRunning(false);
          setCompleted(true);
          localStorage.setItem('ht_running', 'false');
          localStorage.removeItem('ht_start');
        }
      }
      startWallRef.current = Date.now();
      remainingAtStartRef.current = timeLeft;
    }
  }, []);

  // Countdown interval
  useEffect(() => {
    if (!isRunning) return;
    startWallRef.current = Date.now();
    remainingAtStartRef.current = timeLeft;
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startWallRef.current) / 1000);
      const remaining = Math.max(0, remainingAtStartRef.current - elapsed);
      setTimeLeft(remaining);
      localStorage.setItem('ht_timeleft', String(remaining));
      if (remaining <= 0) {
        setIsRunning(false);
        setCompleted(true);
        localStorage.setItem('ht_running', 'false');
        localStorage.removeItem('ht_start');
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
  }, [isRunning]);

  // Close settings popup on outside click
  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSettings]);

  const toggleTimer = () => {
    if (isRunning) {
      localStorage.setItem('ht_running', 'false');
      localStorage.removeItem('ht_start');
      setIsRunning(false);
    } else {
      if (timeLeft <= 0) {
        setTimeLeft(duration);
        localStorage.setItem('ht_timeleft', String(duration));
      }
      setCompleted(false);
      localStorage.setItem('ht_running', 'true');
      localStorage.setItem('ht_start', String(Date.now()));
      setIsRunning(true);
    }
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(duration);
    setCompleted(false);
    localStorage.setItem('ht_timeleft', String(duration));
    localStorage.setItem('ht_running', 'false');
    localStorage.removeItem('ht_start');
  };

  const applyDuration = (seconds: number) => {
    setIsRunning(false);
    setDuration(seconds);
    setTimeLeft(seconds);
    setCompleted(false);
    localStorage.setItem('ht_duration', String(seconds));
    localStorage.setItem('ht_timeleft', String(seconds));
    localStorage.setItem('ht_running', 'false');
    localStorage.removeItem('ht_start');
    setShowSettings(false);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const presets = [5, 10, 15, 25, 30, 45, 60];

  const isPulse = completed;
  const isLow = !completed && timeLeft > 0 && timeLeft <= 60;

  return (
    <div className={`relative ${className}`} ref={settingsRef}>
      {/* Oblong pill */}
      <div
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full border font-mono text-[13px] sm:text-sm transition-colors ${
          isPulse
            ? 'border-[#3FB950] bg-[#3FB950]/10 text-[#3FB950]'
            : 'border-[#30363D] bg-[#161B22] text-[#8B949E]'
        }`}
      >
        <button
          onClick={toggleTimer}
          className="hover:text-white transition-colors cursor-pointer"
          aria-label={isRunning ? 'Pause' : 'Start'}
        >
          {isPulse ? (
            <CheckCircle2 size={16} />
          ) : isRunning ? (
            <Pause size={16} />
          ) : (
            <Play size={16} />
          )}
        </button>

        <span
          className={`font-bold min-w-[52px] text-center ${
            isPulse ? 'text-[#3FB950]' : isLow ? 'text-[#F85149]' : 'text-white'
          }`}
        >
          {formatTime(timeLeft)}
        </span>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="hover:text-white transition-colors cursor-pointer"
          aria-label="Timer settings"
        >
          <Settings size={14} />
        </button>

        {timeLeft < duration && timeLeft > 0 && (
          <button
            onClick={resetTimer}
            className="hover:text-[#F85149] transition-colors cursor-pointer"
            aria-label="Reset"
          >
            <Square size={13} />
          </button>
        )}
      </div>

      {/* Settings popup */}
      {showSettings && (
        <div className="absolute top-full right-0 mt-2 p-4 rounded-lg border border-[#30363D] bg-[#161B22] shadow-xl z-50 min-w-[240px] space-y-3">
          <div className="text-xs font-mono font-bold text-[#8B949E] uppercase tracking-wider">
            Timer Duration
          </div>

          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => applyDuration(p * 60)}
                className={`px-3 py-1.5 rounded text-sm font-mono font-bold transition-colors cursor-pointer ${
                  duration === p * 60
                    ? 'bg-[#E3B341] text-[#0F1115]'
                    : 'bg-[#0D1117] text-[#8B949E] hover:text-white border border-[#30363D]'
                }`}
              >
                {p}m
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-[#2D333B]">
            <input
              type="number"
              min={1}
              max={999}
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              placeholder="min"
              className="w-20 px-2 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-white text-sm font-mono text-center focus:outline-none focus:border-[#E3B341] placeholder-slate-600"
            />
            <span className="text-xs font-mono text-[#8B949E]">min</span>
            <button
              onClick={() => {
                const val = parseInt(customMinutes, 10);
                if (val > 0 && !isNaN(val)) applyDuration(val * 60);
              }}
              className="px-3 py-1.5 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-xs font-bold uppercase rounded transition-colors cursor-pointer ml-auto"
            >
              Set
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
