import DelegatePortal from "@/components/registration/DelegatePortal";
export const metadata = { title: "Delegate portal | AIDSL 2026" };
export default async function Page({
  params,
}: {
  params: Promise<{ segments?: string[] }>;
}) {
  const { segments } = await params;
  return <DelegatePortal segments={segments ?? []} />;
}
