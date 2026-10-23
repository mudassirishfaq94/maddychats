"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";

export function DeviceLinkQr({ payload, expiresAt }: { payload: string; expiresAt: string }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 256, color: { dark: "#111827", light: "#ffffff" } })
      .then(value => { if (active) setImage(value); })
      .catch(() => { if (active) setImage(""); });
    return () => { active = false; };
  }, [payload]);

  return <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
    {image ? <Image unoptimized src={image} width={256} height={256} alt="Temporary secure device-link QR code" className="mx-auto h-64 w-64 max-w-full rounded-lg bg-white p-2" /> : <p role="status" className="p-8 text-sm text-[var(--muted)]">Preparing your secure QR code…</p>}
    <p className="mt-2 text-xs text-[var(--muted)]">Only scan this code with a trusted device you own. It expires at {new Date(expiresAt).toLocaleTimeString()} and works once.</p>
  </div>;
}
