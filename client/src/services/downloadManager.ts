import { toast } from 'sonner';

/**
 * Download a file with progress tracking via sonner toast.
 * Uses ReadableStream to track bytes received.
 * Toast persists across page navigations (Sonner is at app root).
 */
export async function downloadWithProgress(url: string, filename: string): Promise<void> {
  const toastId = toast.loading(`Đang tải: ${filename}`, {
    description: 'Đang kết nối...',
    duration: Infinity,
  });

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentLength = res.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    // Fallback: no streaming or unknown size
    if (!res.body || !total) {
      toast.loading(`Đang tải: ${filename}`, {
        id: toastId,
        description: 'Đang tải (không rõ kích thước)...',
      });
      const blob = await res.blob();
      triggerDownload(blob, filename);
      toast.success(`Đã tải xong: ${filename}`, {
        id: toastId,
        description: formatSize(blob.size),
        duration: 4000,
      });
      return;
    }

    // Stream with progress
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;

      const percent = Math.round((received / total) * 100);
      toast.loading(`Đang tải: ${filename}`, {
        id: toastId,
        description: `${percent}%  •  ${formatSize(received)} / ${formatSize(total)}`,
      });
    }

    const blob = new Blob(chunks as BlobPart[]);
    triggerDownload(blob, filename);

    toast.success(`Đã tải xong: ${filename}`, {
      id: toastId,
      description: formatSize(total),
      duration: 4000,
    });
  } catch (err: any) {
    console.error('Download error:', err);
    toast.error(`Lỗi tải: ${filename}`, {
      id: toastId,
      description: err.message || 'Không thể tải xuống',
      duration: 5000,
    });
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
