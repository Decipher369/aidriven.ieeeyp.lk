"use client";
import { usePathname } from "next/navigation";
import LenisWrapper from "./LenisWrapper";
import { ConditionalHeader, ConditionalFooter } from "./ConditionalElements";
import BackgroundWrapper from "./common/BgWrapper";
export default function SiteShell({ children }) {
  const path = usePathname();
  if (path === "/" || path === "/register" || path === "/login" || path === "/forgot-password" || path === "/reset-password" || path === "/set-password" || path === "/admin" || path.startsWith("/admin/") || path === "/portal" || path.startsWith("/portal/")) return children;
  return (
    <>
      <ConditionalHeader />
      <LenisWrapper>
        <BackgroundWrapper>{children}</BackgroundWrapper>
        <ConditionalFooter />
      </LenisWrapper>
    </>
  );
}
