import React from "react";
import { openScreenshotPopup } from "../services/Screenshot";


export default function ScreenshotButton() {
  const handleScreenshot = async () => {
    const url = await openScreenshotPopup();
    if (url) {
      console.log("Screenshot URL:", url);
      // Here you can set it in state or pass to parent
    }
  };

  return (
    <button
      onClick={handleScreenshot}
      className="bg-blue-500 text-white px-4 py-2 rounded"
    >
      Take Screenshot
    </button>
  );
}
