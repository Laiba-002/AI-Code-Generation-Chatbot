export async function openScreenshotPopup(): Promise<string | null> {
  return new Promise((resolve) => {
    const popup = window.open(
      "/screenshot.html",
      "screenshotPopup",
      "width=500,height=500"
    );

    const listener = (event: MessageEvent) => {
      if (event.data.type === "SCREENSHOT_RESULT") {
        resolve(event.data.url || null);
        window.removeEventListener("message", listener);
      }
    };

    window.addEventListener("message", listener);
  });
}
