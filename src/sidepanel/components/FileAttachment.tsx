import React, { useRef } from 'react';
import { Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';
import { AttachedFile } from '../../background/files/parser';

export const MAX_IMAGE_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_ATTACHMENT_BYTES = 5 * 1024 * 1024;

interface FileAttachmentProps {
  files: AttachedFile[];
  onAddFiles: (newFiles: AttachedFile[]) => void;
  onRemoveFile: (index: number) => void;
  disabled?: boolean;
  onError?: (message: string) => void;
}

export const FileAttachment: React.FC<FileAttachmentProps> = ({
  files,
  onAddFiles,
  onRemoveFile,
  disabled,
  onError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        className="hidden"
        accept=".txt,.md,.json,.csv,.xml,.html,.png,.jpg,.jpeg,.webp"
        disabled={disabled}
      />

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-400 transition cursor-pointer"
        >
          <Paperclip className="w-3.5 h-3.5" />
          <span>Attach reference files / images</span>
        </button>

        {files.length > 0 && (
          <span className="text-[10px] text-slate-500 font-mono">
            {files.length} file{files.length > 1 ? 's' : ''} mounted
          </span>
        )}
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-0.5">
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
                className="text-slate-500 hover:text-rose-400 ml-0.5 flex-shrink-0"
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
