import GlassCard from "@/components/ui/glass-card";

export default function InsightsUnavailable({ reason }: { reason: string }) {
  return (
    <GlassCard className="border-dashed p-6 text-center">
      <p className="text-sm font-medium text-white/70">Company insights unavailable</p>
      <p className="mt-1.5 text-sm text-white/40">{reason}</p>
    </GlassCard>
  );
}
