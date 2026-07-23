import Image from "next/image";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#F6FAFD] px-6 font-[family-name:var(--font-display)] text-[#073571]">
       <div className="pointer-events-none absolute left-1/2 top-1/3 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#72A9E2]/10 blur-[120px]" />

      <div className="relative flex flex-col items-center text-center">
        <Image
          src="/logo-mark.png"
          alt="EduOS"
          width={56}
          height={56}
          className="rounded-xl"
        />

        <span className="mt-8 inline-block rounded-full border border-[#72A9E2]/30 bg-[#72A9E2]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#72A9E2]">
          Error 404
        </span>

        <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Page <span className="text-[#72A9E2]">not found</span>
        </h1>

        <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600">
          The page you&apos;re looking for doesn&apos;t exist or may have been
          moved. Let&apos;s get you back on track.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/"
             className="rounded-full bg-[#073571] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#073571]/15 transition-all hover:scale-[1.03] hover:bg-[#052247] active:scale-[0.97]"
          >
            Back to Home
          </a>
          <a
            href="https://wa.me/919789471572"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-[#073571] transition-all hover:border-slate-400 hover:bg-slate-50"
          >
            Contact Support
          </a>
        </div>
      </div>
    </main>
  );
}