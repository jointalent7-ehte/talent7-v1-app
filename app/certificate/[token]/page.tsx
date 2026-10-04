import type { Metadata } from "next";
import Link from "next/link";
import GrowthEvent from "../../growth-event";
import { getPublicCompetitionCertificate } from "../../../lib/public-competition-certificate";
import CertificateActions from "./certificate-actions";

export const dynamic = "force-dynamic";

type CertificatePageProps = { params: Promise<{ token: string }> };

function issuedDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

export async function generateMetadata({ params }: CertificatePageProps): Promise<Metadata> {
  const { token } = await params;
  const certificate = await getPublicCompetitionCertificate(token);
  const title = certificate ? `${certificate.recipient_name} · ${certificate.award_type}` : "Talent7 certificate";
  const description = certificate
    ? `Verify ${certificate.recipient_name}'s proof-backed ${certificate.award_type} certificate from ${certificate.competition_title}.`
    : "Verify a proof-backed Talent7 competition certificate.";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description }
  };
}

export default async function CompetitionCertificatePage({ params }: CertificatePageProps) {
  const { token } = await params;
  const certificate = await getPublicCompetitionCertificate(token);

  if (!certificate) {
    return (
      <main className="certificateLanding unavailable">
        <div className="certificatePageShell">
          <header className="certificateBrand"><Link href="/">Talent<span>7</span></Link><small>Certificate verification</small></header>
          <section className="certificateUnavailable"><span>Verification unavailable</span><h1>This certificate cannot be shown.</h1><p>The link may be invalid, revoked, or its owner may have switched public sharing off.</p><Link href="/">Return to Talent7</Link></section>
        </div>
      </main>
    );
  }

  return (
    <main className="certificateLanding">
      <GrowthEvent eventName="shared_link_view" resourceToken={token} resourceType="competition_certificate" source="certificate" />
      <div className="certificatePageShell">
        <header className="certificateBrand"><Link href="/">Talent<span>7</span></Link><small>Certificate verification</small></header>
        <section className={`talent7Certificate award-${certificate.award_type.toLowerCase().replace(/\s+/g, "-")}`}>
          <div className="certificateCorner top" aria-hidden="true" />
          <div className="certificateCorner bottom" aria-hidden="true" />
          <div className="certificateSeal" aria-hidden="true"><span>7</span><small>Verified</small></div>
          <p>Talent7 certifies that</p>
          <h1>{certificate.recipient_name}</h1>
          <h2>{certificate.award_type}</h2>
          <p className="certificateStatement">earned this distinction through a proof-backed, organizer-reviewed result in</p>
          <h3>{certificate.competition_title}</h3>
          <div className="certificateFacts">
            <div><span>Activity</span><strong>{certificate.activity_name}</strong></div>
            <div><span>Highest round</span><strong>{certificate.highest_round}</strong></div>
            <div><span>Cohort</span><strong>{certificate.cohort_number}</strong></div>
            {certificate.verified_placement && <div><span>Verified place</span><strong>#{certificate.verified_placement}</strong></div>}
            {certificate.verified_score !== null && <div><span>Verified score</span><strong>{certificate.verified_score}</strong></div>}
          </div>
          <div className="certificateFooter"><div><span>Issued</span><strong>{issuedDate(certificate.issued_at)}</strong></div><div><span>Certificate number</span><strong>{certificate.certificate_number}</strong></div><b>Authentic Talent7 record</b></div>
        </section>
        <CertificateActions />
        <p className="certificatePrivacyNote">This page verifies only the certificate details its owner chose to share. Account identifiers, contact details, private footage, and shipping information are never included.</p>
      </div>
    </main>
  );
}
