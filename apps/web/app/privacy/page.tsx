import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "ConnectMySkool privacy policy — how we collect, use, and protect your data.",
  alternates: { canonical: "https://connectmyskool.com/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0D1B2A] px-6 py-16 text-slate-300">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-[#1BABB4] hover:underline">&larr; Back to Home</Link>
        <h1 className="mt-8 text-3xl font-extrabold text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-400">Last updated: 16 June 2026</p>

        <section className="mt-10 space-y-6 text-sm leading-relaxed">
          <div>
            <p>
              ConnectMySkool (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;the app&rdquo;) provides a school
              management platform consisting of a web portal for school staff and a mobile application for parents
              and teachers. This policy explains what information we collect through the ConnectMySkool mobile app
              and website, how we use it, and the choices you have.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">1. Information We Collect</h2>
            <p className="mt-2">We collect the following information to operate the service:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <span className="font-semibold text-slate-200">Phone number.</span> Parents, teachers, and staff sign
                in using their mobile number and a one-time password (OTP) sent by SMS. We use the phone number solely
                for authentication and to send school-related notifications.
              </li>
              <li>
                <span className="font-semibold text-slate-200">Account &amp; profile data.</span> Names and roles of
                staff, parents, and students, provided by the school during onboarding.
              </li>
              <li>
                <span className="font-semibold text-slate-200">Student records.</span> Attendance, homework,
                academic information, and class/section details, entered by school staff.
              </li>
              <li>
                <span className="font-semibold text-slate-200">Payment information.</span> Fee transactions are
                processed by our payment partner Razorpay. We do not store card numbers or banking credentials; we
                retain only transaction status and reference IDs.
              </li>
              <li>
                <span className="font-semibold text-slate-200">Device tokens.</span> If you enable notifications, we
                store a push-notification token to deliver school updates to your device.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">2. How We Use Your Data</h2>
            <p className="mt-2">
              Data is used solely to power your school&apos;s ERP portal and the parent/teacher mobile app —
              authenticating logins, displaying attendance, homework, and announcements, processing fee payments, and
              sending notifications. We do <span className="font-semibold text-slate-200">not</span> sell, rent, or
              share your data for advertising purposes, and we do not use it to build advertising profiles.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">3. Children&apos;s Information</h2>
            <p className="mt-2">
              ConnectMySkool is used by schools to manage student information. The app itself is intended for use by
              adults (school staff, teachers, and parents/guardians); student records are entered and controlled by
              the school. We act as a processor of student data on behalf of the school and do not knowingly allow
              children to create their own accounts or collect data directly from children. A school or parent may
              request correction or deletion of a student&apos;s data at any time using the contact below.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">4. Sharing With Third Parties</h2>
            <p className="mt-2">
              We share data only with service providers strictly necessary to run the app:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><span className="font-semibold text-slate-200">Supabase</span> — secure database, authentication, and hosting.</li>
              <li><span className="font-semibold text-slate-200">Razorpay</span> — payment processing for school fees.</li>
              <li><span className="font-semibold text-slate-200">SMS gateway</span> — delivery of login OTPs and notifications.</li>
              <li><span className="font-semibold text-slate-200">Push notification services</span> — delivery of app notifications.</li>
            </ul>
            <p className="mt-2">
              We may also disclose data where required by law. We do not share data with any party for advertising.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">5. Data Security</h2>
            <p className="mt-2">
              All data is encrypted in transit (TLS) and at rest. We use Supabase&apos;s enterprise-grade
              infrastructure with row-level security policies ensuring each school can only access its own data.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">6. Data Retention &amp; Deletion</h2>
            <p className="mt-2">
              School data is retained for the duration of the subscription. Upon cancellation, data can be exported
              and is deleted within 30 days of request. Individuals may request access to, correction of, or deletion
              of their personal data by emailing the address below.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">7. Changes to This Policy</h2>
            <p className="mt-2">
              We may update this policy from time to time. Material changes will be reflected by the &ldquo;Last
              updated&rdquo; date above.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">8. Contact</h2>
            <p className="mt-2">
              For privacy-related inquiries, or to request access or deletion of your data, contact us at{" "}
              <a href="mailto:balaji.p2prhel@gmail.com" className="text-[#1BABB4] hover:underline">
                balaji.p2prhel@gmail.com
              </a>.
            </p>
          </div>
        </section>
      </article>
    </div>
  );
}
