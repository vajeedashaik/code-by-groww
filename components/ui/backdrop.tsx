import { DotPattern } from "@/components/magicui/dot-pattern";

/** Fixed ambient background: dot grid + soft green glow blobs, sits behind every page. */
export default function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink" aria-hidden="true">
      <DotPattern glow className="[mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <div className="absolute -top-40 left-1/4 h-[32rem] w-[32rem] animate-float rounded-full bg-pulse/20 blur-[140px]" />
      <div
        className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] animate-float rounded-full bg-pulse-soft/10 blur-[140px]"
        style={{ animationDelay: "-3s" }}
      />
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-ink" />
    </div>
  );
}
