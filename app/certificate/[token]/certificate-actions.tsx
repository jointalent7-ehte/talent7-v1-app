"use client";

import { openTalent7Share } from "../../talent7-share-sheet";

export default function CertificateActions() {
  function shareCertificate() {
    openTalent7Share({
      title: "Verified Talent7 certificate",
      text: "View this verified achievement certificate on Talent7.",
      url: window.location.href
    });
  }

  return (
    <div className="certificateActions">
      <button onClick={() => window.print()} type="button">Print or save PDF</button>
      <button onClick={shareCertificate} type="button">Share verification link</button>
    </div>
  );
}
