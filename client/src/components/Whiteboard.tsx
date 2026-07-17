import { useState, useCallback, useEffect, useRef } from 'react';
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw';
import { classroomAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Cloud, CloudOff, Loader2, PenTool, Trash2 } from 'lucide-react';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types';
import type { AppState } from '@excalidraw/excalidraw/types/types';

interface WhiteboardProps {
  classroomId: string;
}

export default function Whiteboard({ classroomId }: WhiteboardProps) {
  const [savedAt, setSavedAt] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loadingServer, setLoadingServer] = useState(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef<{ elements: any[]; appState: any; files?: any } | null>(null);

  // Load initial data from server
  const [initialData, setInitialData] = useState<{
    elements: readonly ExcalidrawElement[];
    appState: Partial<AppState>;
    files: Record<string, any>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadFromServer = async () => {
      setLoadingServer(true);
      try {
        const res = await classroomAPI.getWhiteboard(classroomId);
        if (cancelled) return;

        const wb = res.data.whiteboard;
        if (wb && wb.elements && wb.elements.length > 0) {
          setInitialData({
            elements: wb.elements || [],
            appState: {
              ...wb.appState,
              theme: 'light',
              viewBackgroundColor: '#ffffff',
              currentItemStrokeColor: '#000000',
              collaborators: new Map(),
            },
            files: wb.files || {},
          });
          if (wb.updatedAt) {
            setSavedAt(new Date(wb.updatedAt).toLocaleTimeString('vi-VN'));
          }
        } else {
          // No server data — start fresh
          setInitialData({
            elements: [],
            appState: {
              viewBackgroundColor: '#ffffff',
              theme: 'light',
              currentItemStrokeColor: '#000000',
            },
            files: {},
          });
        }
      } catch (err) {
        console.error('Failed to load whiteboard from server:', err);
        // Fallback to empty
        if (!cancelled) {
          setInitialData({
            elements: [],
            appState: {
              viewBackgroundColor: '#ffffff',
              theme: 'light',
              currentItemStrokeColor: '#000000',
            },
            files: {},
          });
        }
      } finally {
        if (!cancelled) setLoadingServer(false);
      }
    };

    loadFromServer();
    return () => { cancelled = true; };
  }, [classroomId]);

  // Save to server (debounced)
  const saveToServer = useCallback(
    async (elements: any[], appState: any, files: any) => {
      setSaving(true);
      setSaveError(false);
      try {
        const res = await classroomAPI.saveWhiteboard(classroomId, {
          elements,
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            theme: appState.theme,
            zoom: appState.zoom,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
          },
          files,
        });
        setSavedAt(new Date(res.data.updatedAt || Date.now()).toLocaleTimeString('vi-VN'));
        setSaveError(false);
      } catch (err) {
        console.error('Failed to save whiteboard:', err);
        setSaveError(true);
      } finally {
        setSaving(false);
      }
    },
    [classroomId],
  );

  // Auto-save on change (debounced 2s)
  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: any) => {
      latestDataRef.current = { elements: [...elements], appState, files };

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        if (latestDataRef.current) {
          saveToServer(latestDataRef.current.elements, latestDataRef.current.appState, latestDataRef.current.files);
        }
      }, 2000);
    },
    [saveToServer],
  );

  // Cleanup timeout on unmount — flush pending save
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Flush any unsaved data on unmount
      if (latestDataRef.current) {
        classroomAPI.saveWhiteboard(classroomId, {
          elements: latestDataRef.current.elements,
          appState: {
            viewBackgroundColor: latestDataRef.current.appState.viewBackgroundColor,
            theme: latestDataRef.current.appState.theme,
            zoom: latestDataRef.current.appState.zoom,
            scrollX: latestDataRef.current.appState.scrollX,
            scrollY: latestDataRef.current.appState.scrollY,
          },
          files: latestDataRef.current.files,
        }).catch(() => {});
      }
    };
  }, [classroomId]);

  const handleClear = async () => {
    if (confirm('Bạn có chắc muốn xóa toàn bộ ghi chú?')) {
      try {
        await classroomAPI.saveWhiteboard(classroomId, {
          elements: [],
          appState: {},
          files: {},
        });
        if (excalidrawAPI) {
          excalidrawAPI.updateScene({ elements: [] });
        }
      } catch (err) {
        console.error('Failed to clear whiteboard on server:', err);
      }
    }
  };

  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);

  useEffect(() => {
    if (excalidrawAPI) {
      excalidrawAPI.updateScene({
        appState: {
          viewBackgroundColor: '#ffffff',
          theme: 'light',
          currentItemStrokeColor: '#000000',
        },
      });
    }
  }, [excalidrawAPI]);

  if (loadingServer || !initialData) {
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
          {saving && (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu...
            </span>
          )}
          {!saving && saveError && (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-red-600 bg-red-50 px-2 py-1 rounded-md">
              <CloudOff className="h-3.5 w-3.5" /> Lưu thất bại
            </span>
          )}
          {!saving && !saveError && savedAt && (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
              <Cloud className="h-3.5 w-3.5" /> Đã lưu lúc {savedAt}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleClear} className="h-8 gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100">
            <Trash2 className="h-3.5 w-3.5" /> Xóa
          </Button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-white custom-excalidraw-wrapper">
        <style dangerouslySetInnerHTML={{__html: `
          .custom-excalidraw-wrapper .layer-ui__library { display: none !important; }
          .custom-excalidraw-wrapper .sidebar-trigger { display: none !important; }
          .custom-excalidraw-wrapper button[aria-label="Library"] { display: none !important; }
        `}} />
        <div className="absolute inset-0">
          <Excalidraw
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            theme="light"
            initialData={initialData}
            onChange={handleChange}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                toggleTheme: false,
                changeViewBackgroundColor: false,
              },
            }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.Export />
            </MainMenu>
          </Excalidraw>
        </div>
      </div>
    </div>
  );
}
