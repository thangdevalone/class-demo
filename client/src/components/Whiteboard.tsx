import { useState, useCallback, useEffect, useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import { classroomAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { CheckCircle2, PenTool, Trash2 } from 'lucide-react';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types';
import type { AppState } from '@excalidraw/excalidraw/types/types';

interface WhiteboardProps {
  classroomId: string;
}

const STORAGE_KEY_PREFIX = 'class-demo-whiteboard-';

export default function Whiteboard({ classroomId }: WhiteboardProps) {
  const [savedAt, setSavedAt] = useState<string>('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageKey = `${STORAGE_KEY_PREFIX}${classroomId}`;

  // Load initial data from localStorage
  const [initialData, setInitialData] = useState<{
    elements: readonly ExcalidrawElement[];
    appState: Partial<AppState>;
  } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setInitialData({
          elements: parsed.elements || [],
          appState: {
            ...parsed.appState,
            collaborators: new Map(),
          },
        });
      } else {
        setInitialData({
          elements: [],
          appState: {
            viewBackgroundColor: '#1a1a2e',
            theme: 'dark',
          },
        });
      }
    } catch {
      setInitialData({
        elements: [],
        appState: {
          viewBackgroundColor: '#1a1a2e',
          theme: 'dark',
        },
      });
    }
  }, [storageKey]);

  // Auto-save on change (debounced)
  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        try {
          const data = {
            elements,
            appState: {
              viewBackgroundColor: appState.viewBackgroundColor,
              theme: appState.theme,
              zoom: appState.zoom,
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
            },
          };
          localStorage.setItem(storageKey, JSON.stringify(data));
          setSavedAt(new Date().toLocaleTimeString('vi-VN'));
        } catch (err) {
          console.error('Failed to save whiteboard:', err);
        }
      }, 1000);
    },
    [storageKey],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleClear = () => {
    if (confirm('Bạn có chắc muốn xóa toàn bộ ghi chú?')) {
      localStorage.removeItem(storageKey);
      window.location.reload(); // Simple way to reset Excalidraw
    }
  };

  if (!initialData) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-black"></div>
          <p className="font-medium text-sm">Đang tải bảng trắng...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-slate-50">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4 bg-white shadow-sm z-10">
        <div className="flex items-center gap-2 text-slate-700">
          <PenTool className="h-4 w-4" />
          <span className="text-sm font-semibold tracking-tight">Ghi chú cá nhân</span>
        </div>
        <div className="flex items-center gap-4">
          {savedAt && (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
              <CheckCircle2 className="h-3.5 w-3.5" /> Đã lưu lúc {savedAt}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleClear} className="h-8 gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100">
            <Trash2 className="h-3.5 w-3.5" /> Xóa
          </Button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-white">
        <Excalidraw
          initialData={initialData}
          onChange={handleChange}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: false,
              export: false,
            },
          }}
        />
      </div>
    </div>
  );
}
