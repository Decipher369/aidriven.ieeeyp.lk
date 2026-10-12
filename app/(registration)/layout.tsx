import type { ReactNode } from "react";
import RegistrationProvider from "@/components/registration/Provider";
import "@/components/registration/registration.css";
export default function RegistrationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="reg-root">
      <RegistrationProvider>{children}</RegistrationProvider>
    </div>
  );
}
