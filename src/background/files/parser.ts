export const MAX_IMAGE_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 10;

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  content: string; // Plain text or base64 data URL
  isImage: boolean;
}

export function sanitizeFileName(name: string): string {
  const cleaned = (name || 'file')
    .replace(/[\r\n]+/g, ' ')
    .replace(/---/g, '')
    .replace(/[<>"'`]/g, '')
    .trim();
  return cleaned.length > 0 ? cleaned.substring(0, 120) : 'file';
}

export function formatAttachedFilesForPrompt(files: AttachedFile[]): {
  textPrompt: string;
  images: string[];
  rejected: string[];
} {
  if (!files || files.length === 0) {
    return { textPrompt: '', images: [], rejected: [] };
  }

  const textBlocks: string[] = [];
  const images: string[] = [];
  const rejected: string[] = [];

  files.slice(0, MAX_ATTACHMENT_COUNT).forEach((file) => {
    const safeName = sanitizeFileName(file.name);

    const limit = file.isImage ? MAX_IMAGE_ATTACHMENT_BYTES : MAX_TEXT_ATTACHMENT_BYTES;
    const approxBytes = file.isImage
      ? Math.floor((file.content.length * 3) / 4)
      : file.content.length;
    if (approxBytes > limit) {
      rejected.push(`${safeName} (${Math.round(approxBytes / (1024 * 1024))} MB exceeds the ${Math.round(limit / (1024 * 1024))} MB limit)`);
      return;
    }

    if (file.isImage) {
      images.push(file.content);
      textBlocks.push(`[ATTACHED IMAGE: "${safeName}"]`);
    } else {
      // Truncate huge text files to safe limit (~10k chars)
      let content = file.content;
      if (content.length > 12000) {
        content = content.substring(0, 12000) + '\n... [content truncated for token limits]';
      }
      textBlocks.push(
        `--- BEGIN ATTACHED FILE: ${safeName} (${file.type || 'text'}) ---\n${content}\n--- END ATTACHED FILE ---`
      );
    }
  });

  if (files.length > MAX_ATTACHMENT_COUNT) {
    rejected.push(`${files.length - MAX_ATTACHMENT_COUNT} additional file(s) ignored (limit ${MAX_ATTACHMENT_COUNT})`);
  }

  return {
    textPrompt: textBlocks.join('\n\n'),
    images,
    rejected,
  };
}
