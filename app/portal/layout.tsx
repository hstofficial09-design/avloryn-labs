import SessionGuard from "@/components/portal/session-guard";

// Wraps every /portal/* page so the inactivity + back-button sign-out guard is always mounted.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SessionGuard />
      {children}
    </>
  );
}
