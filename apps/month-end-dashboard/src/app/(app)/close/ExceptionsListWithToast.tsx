"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ExceptionsList } from "./ExceptionsList";
import { ToastBanner } from "@/components/close/ToastBanner";
import type { AppUser } from "@/lib/auth/appUser";

export function ExceptionsListWithToast({
  exceptions,
  orgId,
  viewer,
  users,
}: {
  exceptions: any[];
  orgId: string;
  viewer: AppUser;
  users?: Array<{ id: string; email: string; role?: string | null }>;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const created = params?.get("created");
    if (created) {
      setMessage(`Created ${created} exceptions`);
      const next = new URLSearchParams(params?.toString());
      next.delete("created");
      router.replace(`?${next.toString()}`);
    }
  }, [params, router]);

  return (
    <div className="space-y-3">
      {message && (
        <ToastBanner message={message} type="success" onDismiss={() => setMessage(null)} />
      )}
      <ExceptionsList exceptions={exceptions} orgId={orgId} viewer={viewer} users={users} />
    </div>
  );
}
