export default function Footer() {
  return (
    <footer className="border-t border-line bg-bone">
      <div className="mx-auto max-w-frame px-5 py-10">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-2.5 font-semibold tracking-[0.12em]">
            <span className="relative block h-5 w-5 rounded-[5px] bg-yellow">
              <span className="absolute inset-[5px] rounded-[2px] bg-ink" />
            </span>
            USTAAD
          </div>
          <p className="max-w-xl font-mono text-[12px] leading-relaxed text-ash">
            Responsible use: USTAAD supports workers, it does not surveil them. It verifies the
            task, never scores the person. Deployments require worker consent, and every uncertain
            result escalates to a human rather than being decided silently.
          </p>
        </div>
        <div className="mt-6 caption">
          Built for the OpenCV AI Competition 2026 · OpenCV 5 · AWS
        </div>
      </div>
    </footer>
  );
}
