"use client";

export function ToastBanner({
  message,
  type = "info",
  onDismiss,
}: {
  message: string;
  type?: "success" | "error" | "info";
  onDismiss?: () => void;
}) {
  const tone =
    type === "success"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : type === "error"
        ? "bg-red-50 text-red-800 border-red-200"
        : "bg-blue-50 text-blue-800 border-blue-200";

  return (
    <div className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${tone}`}>
      <div>{message}</div>
      {onDismiss && (
        <button onClick={onDismiss} className="text-xs underline">
          Dismiss
        </button>
      )}
    </div>
  );
}
