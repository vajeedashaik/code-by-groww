import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex justify-center py-12">
      <SignIn
        appearance={{
          variables: {
            colorPrimary: "#00d084",
            colorBackground: "transparent",
            // Clerk's own internal stylesheet outranks a plain Tailwind
            // utility class handed to `elements` (both are single-class
            // specificity, but Clerk's loads after Tailwind's), so
            // `elements.headerTitle: "text-white"` etc. below was being
            // silently overridden back to Clerk's near-black default text
            // color — unreadable on this dark card. `variables` are consumed
            // directly by Clerk's theming engine instead of fighting the
            // cascade, so this is the actually-effective way to set text
            // color here.
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
