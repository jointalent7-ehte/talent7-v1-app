"use client";

export default function CertificateActions() {
  async function shareCertificate() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: "Verified Talent7 certificate", url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url).catch(() => undefined);
  }

  return (
    <div className="certificateActions">
      <button onClick={() => window.print()} type="button">Print or save PDF</button>
      <button onClick={shareCertificate} type="button">Share verification link</button>
    </div>
  );
}
