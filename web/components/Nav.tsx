"use client";

const LINKS = [
  ["#learn", "Learn"],
  ["#verify", "Verify"],
  ["#decision", "Decision"],
  ["#simulation", "Simulation"],
  ["#lab", "Live lab"],
  ["#results", "Results"],
  ["#architecture", "Architecture"],
];

export default function Nav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-frame items-center justify-between px-5">
        <a href="#top" className="flex items-center gap-2.5 font-semibold tracking-[0.12em]">
          <span className="relative block h-6 w-6 rounded-[6px] bg-yellow">
            <span className="absolute inset-[6px] rounded-[2px] bg-ink" />
          </span>
          USTAAD
        </a>
        <ul className="hidden items-center gap-6 font-mono text-[12.5px] text-ash lg:flex">
          {LINKS.map(([href, label]) => (
            <li key={href}>
              <a href={href} className="transition-colors hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <a
          href="#lab"
          className="rounded-lg bg-ink px-3.5 py-2 text-[13px] font-semibold text-paper transition-colors hover:bg-ink/85"
        >
          Try live
        </a>
      </div>
    </nav>
  );
}
