import React from "react";

interface ScreenshotPreviewProps {
  screenshotPreview: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const ScreenshotPreview: React.FC<ScreenshotPreviewProps> = ({
  screenshotPreview,
  onCancel,
  onConfirm,
}) => {
  if (!screenshotPreview) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
      <div className="bg-gray-900 rounded-lg p-4 max-w-lg w-full shadow-lg">
        <img
          src={screenshotPreview}
          alt="Screenshot Preview"
          className="w-full rounded"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-primary-600 hover:bg-primary-500 text-white"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScreenshotPreview;
