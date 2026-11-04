import { CircleDashed } from "lucide-react";

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-8 text-center">
      <span
        className="mb-3 grid size-9 place-items-center rounded-full bg-surface-muted text-subtle"
        aria-hidden="true"
      >
        <CircleDashed size={18} strokeWidth={1.7} />
      </span>
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted">
        {description}
      </p>
    </div>
  );
}
