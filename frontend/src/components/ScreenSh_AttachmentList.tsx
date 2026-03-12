import React from "react";

interface Attachment {
  id: string;
  name: string;
  url: string;
}

interface AttachmentListProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

const AttachmentList: React.FC<AttachmentListProps> = ({
  attachments,
  onRemove,
}) => {
  if (!attachments.length) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="relative bg-gray-800 p-2 rounded-lg shadow-md"
        >
          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 underline"
          >
            {attachment.name}
          </a>
          <button
            onClick={() => onRemove(attachment.id)}
            className="absolute top-0 right-0 text-red-500 hover:text-red-400 px-1"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

export default AttachmentList;
