import Skeleton from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}
