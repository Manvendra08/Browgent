export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  content: string; // Plain text or base64 data URL
  isImage: boolean;
}

export function formatAttachedFilesForPrompt(files: AttachedFile[]): {
  textPrompt: string;
  images: string[];
} {
  if (!files || files.length === 0) {
    return { textPrompt: '', images: [] };
  }

  const textBlocks: string[] = [];
  const images: string[] = [];

  files.forEach((file) => {
    if (file.isImage) {
      images.push(file.content);
      textBlocks.push(`[ATTACHED IMAGE: "${file.name}"]`);
    } else {
      // Truncate huge text files to safe limit (~10k chars)
      let content = file.content;
      if (content.length > 12000) {
        content = content.substring(0, 12000) + '\n... [content truncated for token limits]';
      }
      textBlocks.push(
        `--- BEGIN ATTACHED FILE: ${file.name} (${file.type || 'text'}) ---\n${content}\n--- END ATTACHED FILE ---`
      );
    }
  });

  return {
    textPrompt: textBlocks.join('\n\n'),
    images,
  };
}
