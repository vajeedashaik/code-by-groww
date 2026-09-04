import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex justify-center py-12">
      <SignUp
        appearance={{
          variables: {
            colorPrimary: "#00d084",
            colorBackground: "transparent",
            // See app/sign-in/[[...sign-in]]/page.tsx for why this can't be
            // done via `elements` className overrides alone.
            colorText: "#ffffff",
            colorTextSecondary: "rgba(255,255,255,0.6)",
            colorInputText: "#ffffff",
            colorNeutral: "#ffffff",
          },
          elements: {
            rootBox: "glass-raised rounded-3xl p-2",
            card: "bg-transparent shadow-none",
            headerTitle: "font-display text-white",
            headerSubtitle: "text-white/50",
            socialButtonsBlockButton: "border-white/10 text-white hover:bg-white/5",
            formFieldLabel: "text-white/60",
            formFieldInput: "bg-white/5 border-white/10 text-white",
            footerActionText: "text-white/45",
            footerActionLink: "text-pulse",
            dividerLine: "bg-white/10",
            dividerText: "text-white/30",
          },
        }}
      />
    </div>
  );
}
