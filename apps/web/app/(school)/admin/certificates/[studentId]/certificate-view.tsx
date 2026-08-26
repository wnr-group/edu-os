"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CertificateData {
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolAddress: string | null;
  studentName: string;
  admissionNumber: string | null;
  className: string;
  sectionName: string;
  parentName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  academicYearName: string;
  studentProfileId: string;
  backHref: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function genderText(gender: string | null): { relation: string; pronoun: string; salutation: string } {
  if (gender === "male") return { relation: "son", pronoun: "His", salutation: "Mr." };
  if (gender === "female") return { relation: "daughter", pronoun: "Her", salutation: "Mrs." };
  return { relation: "child", pronoun: "Their", salutation: "Mr./Mrs." };
}

export function CertificateView({ data }: { data: CertificateData }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [logging, setLogging] = useState(false);
  const { relation, pronoun, salutation } = genderText(data.gender);
  const hasWarning = !data.dateOfBirth || !data.parentName || !data.gender;

  async function handlePrint() {
    setLogging(true);
    try {
      await fetch("/api/certificates/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_profile_id: data.studentProfileId }),
      });
    } catch {
      // Non-blocking — proceed with print even if log fails
    }
    setLogging(false);

    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bonafide Certificate — ${data.studentName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { size: A4 portrait; margin: 0; }
            body { font-family: 'Times New Roman', Times, serif; color: #1a1a1a; width: 210mm; min-height: 297mm; padding: 40px 60px 60px; position: relative; }
            .header { display: flex; align-items: center; gap: 20px; padding-bottom: 16px; border-bottom: 3px solid #1a3a7a; }
            .header img { width: 90px; height: 90px; object-fit: contain; flex-shrink: 0; }
            .header-text { flex: 1; text-align: center; }
            .header-text h1 { font-size: 28px; font-weight: bold; text-transform: uppercase; letter-spacing: 3px; color: #c41e1e; margin-bottom: 6px; font-family: 'Times New Roman', Times, serif; }
            .header-text p { font-size: 13px; color: #333; line-height: 1.6; }
            .header-text p strong { font-weight: bold; }
            .title { text-align: center; font-size: 16px; font-weight: bold; text-decoration: underline; letter-spacing: 1.5px; margin-top: 60px; margin-bottom: 60px; }
            .body-text { font-size: 16px; line-height: 2.4; text-indent: 60px; position: relative; z-index: 1; margin: 0 20px; }
            .body-text strong { font-weight: bold; }
            .watermark-wrap { position: relative; min-height: 300px; }
            .watermark { position: absolute; bottom: -40px; left: 50%; transform: translateX(-50%); width: 280px; height: 280px; opacity: 0.10; object-fit: contain; z-index: 0; border-radius: 50%; }
            .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 100px; padding: 0 20px; font-size: 15px; font-weight: bold; }
            @media print { body { padding: 40px 60px 60px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="header">
            ${data.schoolLogoUrl ? `<img src="${data.schoolLogoUrl}" alt="Logo" />` : ""}
            <div class="header-text">
              <h1>${data.schoolName}</h1>
              ${data.schoolAddress ? data.schoolAddress.split("\n").map((line: string) => `<p>${line}</p>`).join("") : ""}
            </div>
          </div>


          <div class="title">TO WHOM IT MAY CONCERN</div>

          <div class="watermark-wrap">
            ${data.schoolLogoUrl ? `<img class="watermark" src="${data.schoolLogoUrl}" alt="" />` : ""}
            <p class="body-text">
              This is to certify that <strong>${data.studentName.toUpperCase()}</strong>, a student of <strong>${data.className} - ${data.sectionName}</strong>, Adm No. <strong>${data.admissionNumber ?? "—"}</strong>, ${relation} of <strong>${salutation} ${(data.parentName ?? "—").toUpperCase()}</strong> is a bonafide student of our school for the academic year <strong>${data.academicYearName}</strong>. ${pronoun} date of birth is <strong>${formatDate(data.dateOfBirth)}</strong> as per our school records.
            </p>
          </div>

          <div class="footer">
            <span>Date : ${formatDate(new Date().toISOString().slice(0, 10))}</span>
            <span>PRINCIPAL</span>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 300);
  }
  
  const isPrincipalView = data.backHref.startsWith("/principal");
        const studentProfileLink = isPrincipalView
        ? `/principal/students/${data.studentProfileId}`
        : `/admin/students/${data.studentProfileId}`;



  return (
    <div className="min-h-screen bg-muted/30 p-6 animate-fade-in-up">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={data.backHref}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Certificates
          </Link>
          <Button onClick={handlePrint} disabled={logging}>
            <Printer className="mr-1.5 h-4 w-4" />
            {logging ? "Preparing…" : "Print / Download PDF"}
          </Button>
        </div>

        {hasWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Some student details are missing (
            {[!data.dateOfBirth && "date of birth", !data.parentName && "parent name", !data.gender && "gender"].filter(Boolean).join(", ")}
            ). <Link href={studentProfileLink} className="font-medium underline">
              Edit the student profile
            </Link> to fill them in before printing.
          </div>
        )}

      


        <div ref={printRef} className="rounded-xl border border-border bg-white px-14 py-10 shadow-sm font-serif">
          {/* Header */}
          <div className="flex items-center gap-5 border-b-[3px] border-[#1a3a7a] pb-4">
            {data.schoolLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.schoolLogoUrl} alt="Logo" className="h-[90px] w-[90px] object-contain shrink-0" />
            )}
            <div className="flex-1 text-center">
              <h1 className="text-2xl font-bold uppercase tracking-[3px] text-[#c41e1e]">{data.schoolName}</h1>
              {data.schoolAddress && data.schoolAddress.split("\n").map((line, i) => (
                <p key={i} className="text-[13px] text-gray-700 leading-relaxed">{line}</p>
              ))}
            </div>
          </div>

          {/* Title */}
          <p className="text-center text-base font-bold underline tracking-wider mt-14 mb-14">TO WHOM IT MAY CONCERN</p>

          {/* Body with watermark */}
          <div className="relative min-h-[250px]">
            {data.schoolLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.schoolLogoUrl}
                alt=""
                className="absolute bottom-[-20px] left-1/2 -translate-x-1/2 h-[280px] w-[280px] object-contain opacity-[0.10] pointer-events-none rounded-full"
              />
            )}
            <p className="text-base leading-[2.4] indent-14 relative z-10 mx-4">
              This is to certify that{" "}
              <strong className="uppercase">{data.studentName}</strong>, a student of{" "}
              <strong>{data.className} - {data.sectionName}</strong>, Adm No. <strong>{data.admissionNumber ?? "—"}</strong>,{" "}
              {relation} of{" "}
              <strong>{salutation} {(data.parentName ?? "—").toUpperCase()}</strong>{" "}
              is a bonafide student of our school for the academic year{" "}
              <strong>{data.academicYearName}</strong>.{" "}
              {pronoun} date of birth is{" "}
              <strong>{formatDate(data.dateOfBirth)}</strong> as per our school records.
            </p>
          </div>

          {/* Footer */}
          <div className="mt-24 flex justify-between items-end mx-4 text-[15px] font-bold">
            <span>Date : {formatDate(new Date().toISOString().slice(0, 10))}</span>
            <span>PRINCIPAL</span>
          </div>
        </div>
      </div>
    </div>
  );
}