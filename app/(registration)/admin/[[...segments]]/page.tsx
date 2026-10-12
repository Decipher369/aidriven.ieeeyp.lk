import AdminPortal from "@/components/registration/AdminPortal";
export const metadata = { title: "Admin workspace | AIDSL 2026" };
export default async function Page({
  params,
}: {
  params: Promise<{ segments?: string[] }>;
}) {
  const { segments } = await params;
  return <AdminPortal segments={segments ?? []} />;
}
