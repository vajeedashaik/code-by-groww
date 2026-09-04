import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";

// Defense-in-depth: middleware already gates these paths, this re-checks at render.
export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  await auth.protect();
  return <>{children}</>;
}
