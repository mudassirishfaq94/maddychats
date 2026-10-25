"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Camera, X } from "lucide-react";
import { isNativeApp } from "@/lib/native-platform";
import { openHostedCameraSettings } from "@/lib/native-push-bridge";

type Detector = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type ScannerWindow = Window & { BarcodeDetector?: { new(options: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } };

export function DeviceLinkScanner({ onPayload }: { onPayload: (raw: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const onPayloadRef = useRef(onPayload);
  const nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  useEffect(() => { onPayloadRef.current = onPayload; }, [onPayload]);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let webControls: { stop(): void } | undefined;
    let nativeScanner: typeof import("@capacitor-mlkit/barcode-scanning").BarcodeScanner | undefined;
    let nativeListener: { remove(): Promise<void> } | undefined;
    const finish = (raw: string) => {
      if (cancelled) return;
      cancelled = true;
      setScanning(false);
      onPayloadRef.current(raw);
    };
    const stop = () => {
      clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      webControls?.stop();
      document.body.classList.remove("barcode-scanner-active");
      void nativeListener?.remove();
      void nativeScanner?.stopScan().catch(() => {});
    };

    void (async () => {
      try {
        if (nativeAndroid) {
          const scanner = await import("@capacitor-mlkit/barcode-scanning");
          nativeScanner = scanner.BarcodeScanner;
          const permission = await nativeScanner.requestPermissions();
          if (cancelled) return;
          if (permission.camera !== "granted") throw new Error("Allow camera access to scan a trusted device’s QR code.");
          nativeListener = await nativeScanner.addListener("barcodesScanned", event => {
            const raw = event.barcodes.find(barcode => barcode.format === scanner.BarcodeFormat.QrCode)?.rawValue;
            if (raw) finish(raw);
          });
          if (cancelled) return;
          document.body.classList.add("barcode-scanner-active");
          await nativeScanner.startScan({ formats: [scanner.BarcodeFormat.QrCode] });
          return;
        }

        const Api = (window as ScannerWindow).BarcodeDetector;
        if (!Api || !(await Api.getSupportedFormats()).includes("qr_code")) {
          if (!video.current) throw new Error("The camera preview is not ready. Try again.");
          const { BrowserQRCodeReader } = await import("@zxing/browser");
          const reader = new BrowserQRCodeReader();
          webControls = await reader.decodeFromVideoDevice(undefined, video.current, result => {
            const raw = result?.getText();
            if (raw) finish(raw);
          });
          if (cancelled) webControls.stop();
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 640 } }, audio: false });
        if (cancelled || !video.current) { stream.getTracks().forEach(track => track.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new Api({ formats: ["qr_code"] });
        const scan = async () => {
          if (cancelled || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            const raw = codes[0]?.rawValue;
            if (raw) { finish(raw); return; }
          } catch { /* Ignore incomplete camera frames and retry. */ }
          if (!cancelled) timer = setTimeout(() => void scan(), 250);
        };
        void scan();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError")
            ? "Camera access is blocked. Allow camera access, then try scanning again."
            : cause instanceof Error ? cause.message : "Could not start the camera.");
          setScanning(false);
        }
        stop();
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [scanning, nativeAndroid]);

  return <div className="mt-3">
    {!scanning ? <button type="button" className="btn btn-secondary min-h-11 w-full" onClick={() => { setError(""); setScanning(true); }}><Camera className="h-4 w-4" aria-hidden="true"/>Scan QR on your new device</button> : nativeAndroid ? <div className="device-link-camera-overlay fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/20 p-5 text-center text-white"><p className="text-lg font-semibold">Scan the QR code on your new device</p><button type="button" className="btn btn-secondary min-h-11" onClick={() => setScanning(false)}><X className="h-4 w-4" aria-hidden="true"/>Cancel scan</button></div> : <div className="mt-3 space-y-3"><video ref={video} muted playsInline className="aspect-square w-full rounded-xl bg-black object-cover" aria-label="Camera preview"/><button type="button" className="btn btn-secondary min-h-11" onClick={() => setScanning(false)}>Stop camera</button></div>}
    {error ? <div className="mt-2"><p role="alert" className="text-sm text-[var(--danger)]">{error}</p>{isNativeApp() ? <button type="button" className="btn btn-secondary mt-2 min-h-11" onClick={() => void openHostedCameraSettings().catch(() => setError("Open Android Settings → Apps → Circlo → Permissions → Camera."))}>Camera settings</button> : null}</div> : null}
  </div>;
}
