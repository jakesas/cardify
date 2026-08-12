import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

type ToastType = 'error' | 'success';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface NotifyState {
  error: (message: string) => void;
  success: (message: string) => void;
}

const NotifyContext = createContext<NotifyState | undefined>(undefined);

const ERROR_DISMISS_MS = 6000;
const SUCCESS_DISMISS_MS = 4000;
const MAX_TOASTS = 3;

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((type: ToastType, message: string) => {
    const id = nextId.current++;
    setToasts(prev => [...prev.slice(-(MAX_TOASTS - 1)), { id, type, message }]);
    window.setTimeout(() => dismiss(id), type === 'error' ? ERROR_DISMISS_MS : SUCCESS_DISMISS_MS);
  }, [dismiss]);

  const error = useCallback((message: string) => push('error', message), [push]);
  const success = useCallback((message: string) => push('success', message), [push]);

  return (
    <NotifyContext.Provider value={{ error, success }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[60] flex flex-col items-end gap-2 pointer-events-none">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center space-x-2 px-4 py-2 rounded text-xs font-mono shadow-lg animate-fade-in max-w-sm ${
                t.type === 'error'
                  ? 'bg-[#F85149]/10 border border-[#F85149]/30 text-[#F85149]'
                  : 'bg-[#3FB950]/10 border border-[#3FB950]/30 text-[#3FB950]'
              }`}
            >
              <span className="flex-grow">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className={t.type === 'error' ? 'text-[#F85149] hover:text-white cursor-pointer' : 'text-[#3FB950] hover:text-white cursor-pointer'}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </NotifyContext.Provider>
  );
}

export function useNotify(): NotifyState {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error('useNotify must be used within a NotifyProvider');
  return ctx;
}
