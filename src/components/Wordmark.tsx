export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display inline-flex items-baseline leading-none text-ink ${className}`}>
      <span className="italic">Adukala</span>
      <span className="ml-[0.08em] inline-block h-[0.18em] w-[0.18em] translate-y-[-0.05em] rounded-full bg-chilli" />
    </span>
  );
}
