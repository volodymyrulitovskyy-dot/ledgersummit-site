import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/appUser";
import { AppNav } from "./AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/auth/login");
  if (!appUser.is_active) redirect("/access-denied");

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav
        role={appUser.role}
        allowedScreens={appUser.allowed_screens}
        userName={appUser.user_name}
        userEmail={appUser.email}
      />
      {children}
    </div>
  );
}
