declare class ImageCapture {
  constructor(track: MediaStreamTrack);
  grabFrame(): Promise<ImageBitmap>;
  takePhoto(): Promise<Blob>;
}
declare class CaptureController {
  setFocusBehavior(behavior: 'focus-change' | 'no-focus-change'): void;
}