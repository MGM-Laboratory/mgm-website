import { AdminLightMode } from "@/components/admin/admin-light-mode";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminLightMode>{children}</AdminLightMode>;
}
