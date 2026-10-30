const STYLES: Record<string, string> = {
  delivered: 'bg-green-500/15 text-green-400 border-green-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  queued: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  delivering: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? 'bg-neutral-500/15 text-neutral-400 border-neutral-500/30';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}
