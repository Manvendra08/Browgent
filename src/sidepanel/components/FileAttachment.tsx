import React, { useRef } from 'react';
import { X, FileText, Image as ImageIcon } from 'lucide-react';
import { AttachedFile } from '../../background/files/parser';

export const MAX_IMAGE_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_ATTACHMENT_BYTES = 5 * 1024 * 1024;

interface FileAttachmentProps {
  files: AttachedFile[];
  onAddFiles: (newFiles: AttachedFile[]) => void;
  onRemoveFile: (index: number) => void;
  disabled?: boolean;
  onError?: (message: string) => void;
  fileInputRef?: React.RefObject<HTMLInputElement>;
}

export const FileAttachment: React.FC<FileAttachmentProps> = ({
  files,
  onAddFiles,
  onRemoveFile,
  disabled,
  onError,
  fileInputRef,
}) => {
  const internalRef = useRef<HTMLInputElement>(null);
  const activeInputRef = fileInputRef || internalRef;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selectedFiles = Array.from(e.target.files);

    selectedFiles.forEach((file) => {
      const isImg = file.type.startsWith('image/');
      const limit = isImg ? MAX_IMAGE_ATTACHMENT_BYTES : MAX_TEXT_ATTACHMENT_BYTES;

      if (file.size > limit) {
        onError?.(
          `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is ${(limit / (1024 * 1024)).toFixed(0)} MB for ${isImg ? 'images' : 'text files'}.`
        );
        return;
      }

      const reader = new FileReader();

      reader.onload = (event) => {
        const content = event.target?.result as string;
        onAddFiles([
          {
            name: file.name,
            type: file.type || 'text/plain',
            size: file.size,
            content,
            isImage: isImg,
          },
        ]);
      };

      if (isImg) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });

    if (activeInputRef.current) {
      activeInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col">
      <input
        type="file"
        ref={activeInputRef}
        onChange={handleFileChange}
        multiple
        className="hidden"
        accept=".txt,.md,.json,.csv,.xml,.html,.png,.jpg,.jpeg,.webp"
        disabled={disabled}
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {files.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700/60 max-w-[180px] truncate"
            >
              {file.isImage ? (
                <ImageIcon className="w-2.5 h-2.5 text-sky-400 flex-shrink-0" />
              ) : (
                <FileText className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
              )}
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => onRemoveFile(idx)}
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                className="text-slate-500 hover:text-rose-400 ml-0.5 flex-shrink-0 cursor-pointer"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
