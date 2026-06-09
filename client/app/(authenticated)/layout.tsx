import { AuthenticatedLayout } from "@/providers/session-provider"

export default function AppAuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>
}
