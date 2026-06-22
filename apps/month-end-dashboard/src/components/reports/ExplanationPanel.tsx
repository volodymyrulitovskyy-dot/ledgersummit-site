"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/formatCurrency";
import { Button } from "@/components/ui/button";

type ExplanationPanelProps = {
  orgId: string;
  period: string; // YYYY-MM-DD
  accountId: string;
  accountName: string;
  ruleId?: string | null;
  onClose?: () => void;
  open?: boolean; // Controls visibility
};

type Explanation = {
  id: string;
  org_id: string;
  period: string;
  account_id: string;
  rule_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  comments: ExplanationComment[];
  attachments: ExplanationAttachment[];
};

type ExplanationComment = {
  id: string;
  explanation_id: string;
  author: string;
  body: string;
  created_at: string;
};

type ExplanationAttachment = {
  id: string;
  explanation_id: string;
  filename: string;
  url: string;
  uploaded_at: string;
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "explained_pending", label: "Explained – pending review" },
  { value: "accepted", label: "Accepted" },
  { value: "deferred", label: "Deferred" },
  { value: "reclassified", label: "Reclassified" },
  { value: "corrected_via_je", label: "Corrected via JE" },
] as const;

export function ExplanationPanel({
  orgId,
  period,
  accountId,
  accountName,
  ruleId,
  onClose,
  open = true,
}: ExplanationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [status, setStatus] = useState<string>("open");
  const [commentText, setCommentText] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isPeriodLocked, setIsPeriodLocked] = useState(false);
  const [isOpen, setIsOpen] = useState(open);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen || !onClose) return;

    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        onClose();
      }
    }

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Update isOpen when open prop changes
  useEffect(() => {
    setIsOpen(open);
  }, [open]);

  // Load existing explanation
  useEffect(() => {
    if (!isOpen) return; // Don't load if closed
    async function loadExplanation() {
      if (!orgId || !period || !accountId) return;

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          orgId,
          period,
          accountId,
        });
        if (ruleId) {
          params.set("ruleId", ruleId);
        }

        const resp = await fetch(`/api/explanations?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });

        if (!resp.ok) {
          if (resp.status === 501) {
            // Explanations not migrated - show message but don't treat as error
            setError("Explanations not migrated");
            setExplanation(null);
            setStatus("open");
            setLoading(false);
            return;
          }
          if (resp.status === 404) {
            // No explanation exists yet - that's fine, not an error
            setExplanation(null);
            setStatus("open");
            setError(null); // Clear any error
            setLoading(false);
            return;
          }
          const errorData = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
          throw new Error(errorData.error || `Request failed (${resp.status})`);
        }

        const data = await resp.json();
        if (data.ok && data.explanation) {
          // Map API response to component state
          setExplanation({
            id: data.explanation.id,
            org_id: data.explanation.org_id || data.explanation.orgId,
            period: data.explanation.period || period,
            account_id: data.explanation.account_id || data.explanation.accountId,
            rule_id: data.explanation.rule_id || data.explanation.ruleId,
            status: data.explanation.status,
            created_at: data.explanation.created_at || data.explanation.createdAt,
            updated_at: data.explanation.updated_at || data.explanation.updatedAt,
            comments: (data.comments || []).map((c: any) => ({
              id: c.id,
              explanation_id: c.explanation_id || c.explanationId,
              author: c.created_by_user_id || c.author || 'Unknown',
              body: c.body,
              created_at: c.created_at || c.createdAt,
            })),
            attachments: (data.attachments || []).map((a: any) => ({
              id: a.id,
              explanation_id: a.explanation_id || a.explanationId,
              filename: a.filename,
              url: a.file_url || a.url,
              uploaded_at: a.created_at || a.createdAt,
            })),
          });
          setStatus(data.explanation.status);
        } else {
          setExplanation(null);
          setStatus("open");
        }
        
        // Check if period is locked
        if (data.periodLocked) {
          setIsPeriodLocked(true);
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    }

    void loadExplanation();
  }, [isOpen, orgId, period, accountId, ruleId]);

  // Save explanation (create or update)
  async function handleSave() {
    if (!orgId || !period || !accountId) return;

    setSaving(true);
    setError(null);

    try {
      // Use POST for upsert (API handles create/update logic)
      const resp = await fetch("/api/explanations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          orgId,
          period,
          accountId,
          ruleId: ruleId || null,
          status,
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
        throw new Error(errorData.error || `Request failed (${resp.status})`);
      }

      const data = await resp.json();
      if (data.ok && data.explanation) {
        // Map API response to component state
        setExplanation({
          id: data.explanation.id,
          org_id: data.explanation.org_id || data.explanation.orgId,
          period: data.explanation.period || period,
          account_id: data.explanation.account_id || data.explanation.accountId,
          rule_id: data.explanation.rule_id || data.explanation.ruleId,
          status: data.explanation.status,
          created_at: data.explanation.created_at || data.explanation.createdAt,
          updated_at: data.explanation.updated_at || data.explanation.updatedAt,
          comments: (data.comments || []).map((c: any) => ({
            id: c.id,
            explanation_id: c.explanation_id || c.explanationId,
            author: c.created_by_user_id || c.author || 'Unknown',
            body: c.body,
            created_at: c.created_at || c.createdAt,
          })),
          attachments: (data.attachments || []).map((a: any) => ({
            id: a.id,
            explanation_id: a.explanation_id || a.explanationId,
            filename: a.filename,
            url: a.file_url || a.url,
            uploaded_at: a.created_at || a.createdAt,
          })),
        });
        // Reload explanation from API to ensure we have latest data
        const reloadResp = await fetch(`/api/explanations?orgId=${encodeURIComponent(orgId)}&period=${encodeURIComponent(period)}&accountId=${encodeURIComponent(accountId)}${ruleId ? `&ruleId=${encodeURIComponent(ruleId)}` : ''}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (reloadResp.ok) {
          const reloadData = await reloadResp.json();
          if (reloadData.ok && reloadData.explanation) {
            setExplanation({
              id: reloadData.explanation.id,
              org_id: reloadData.explanation.org_id || reloadData.explanation.orgId,
              period: reloadData.explanation.period || period,
              account_id: reloadData.explanation.account_id || reloadData.explanation.accountId,
              rule_id: reloadData.explanation.rule_id || reloadData.explanation.ruleId,
              status: reloadData.explanation.status,
              created_at: reloadData.explanation.created_at || reloadData.explanation.createdAt,
              updated_at: reloadData.explanation.updated_at || reloadData.explanation.updatedAt,
              comments: (reloadData.comments || []).map((c: any) => ({
                id: c.id,
                explanation_id: c.explanation_id || c.explanationId,
                author: c.created_by_user_id || c.author || 'Unknown',
                body: c.body,
                created_at: c.created_at || c.createdAt,
              })),
              attachments: (reloadData.attachments || []).map((a: any) => ({
                id: a.id,
                explanation_id: a.explanation_id || a.explanationId,
                filename: a.filename,
                url: a.file_url || a.url,
                uploaded_at: a.created_at || a.createdAt,
              })),
            });
          }
        }
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  // Add comment
  async function handleAddComment() {
    if (!commentText.trim() || !explanation) return;

    setSaving(true);
    setError(null);

    try {
      const resp = await fetch(`/api/explanations/${explanation.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          text: commentText.trim(), // API expects 'text', also support 'body' for compatibility
          body: commentText.trim(),
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
        throw new Error(errorData.error || `Request failed (${resp.status})`);
      }

      const data = await resp.json();
      if (data.ok && data.comment) {
        setExplanation((prev) =>
          prev
            ? {
                ...prev,
                comments: [...prev.comments, data.comment],
              }
            : null
        );
        setCommentText("");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  // Upload file
  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !explanation) return;

    setUploadingFile(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const resp = await fetch(`/api/explanations/${explanation.id}/attachments`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        body: formData,
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
        throw new Error(errorData.error || `Request failed (${resp.status})`);
      }

      const data = await resp.json();
      if (data.ok && data.attachment) {
        setExplanation((prev) =>
          prev
            ? {
                ...prev,
                attachments: [...prev.attachments, data.attachment],
              }
            : null
        );
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setUploadingFile(false);
      // Reset file input
      event.target.value = "";
    }
  }

  if (!isOpen) return null;

  const handleClose = () => {
    setIsOpen(false);
    if (onClose) onClose();
  };

  const isStandalone = !!onClose;

  return (
    <>
      {/* Backdrop - only show for standalone mode */}
      {isStandalone && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer/Modal - fixed for standalone, simple panel for embedded */}
      {isStandalone ? (
        <div className="fixed right-0 top-0 h-full w-full max-w-xl md:w-[420px] bg-white shadow-xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`flex items-center justify-between border-b border-slate-200 ${isStandalone ? 'px-6 py-4' : 'px-4 py-3'} flex-shrink-0`}>
          <div className="flex-1">
            <h3 className={`${isStandalone ? 'text-lg' : 'text-sm'} font-semibold text-slate-900`}>Explanation</h3>
            <div className={`mt-1 ${isStandalone ? 'text-sm' : 'text-xs'} text-slate-600`}>
              {accountName} • {accountId} • {period}
            </div>
          </div>
          {(onClose || isStandalone) && (
            <button
              onClick={handleClose}
              className={`ml-4 rounded-lg ${isStandalone ? 'p-2' : 'p-1'} text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors`}
              aria-label="Close"
            >
              <svg className={`${isStandalone ? 'w-5 h-5' : 'w-4 h-4'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto ${isStandalone ? 'px-6 py-4' : 'px-4 py-4'} space-y-4`}>
          {loading && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm text-slate-600">Loading explanation...</div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="text-sm font-medium text-red-800">Error</div>
              <div className="mt-1 text-xs text-red-600">{error}</div>
            </div>
          )}

          {/* No explanation yet */}
          {!loading && !explanation && !error && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
              <div className="text-sm font-medium text-slate-700 mb-2">No explanation yet</div>
              <div className="text-xs text-slate-600 mb-4">Create an explanation for this account and period.</div>
              <Button
                onClick={handleSave}
                disabled={saving || isPeriodLocked}
                className="w-full sm:w-auto"
              >
                Create Explanation
              </Button>
            </div>
          )}

          {/* Period locked notice */}
          {isPeriodLocked && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-medium text-amber-800">Period is locked</div>
              <div className="mt-1 text-xs text-amber-700">This period is locked. Explanations are read-only.</div>
            </div>
          )}

          {/* Status and Save - only show if explanation exists or creating */}
          {(explanation || !loading) && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={saving || isPeriodLocked}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Save button */}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={handleSave}
                  disabled={saving || (explanation && status === explanation.status) || isPeriodLocked}
                  className="flex-1"
                >
                  {explanation ? "Update Status" : "Create Explanation"}
                </Button>
              </div>
            </>
          )}

      {/* Comments section */}
      {explanation && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Comments</div>

          {/* Comment list */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {explanation.comments.length === 0 ? (
              <div className="text-xs text-slate-500 italic">No comments yet</div>
            ) : (
              explanation.comments.map((comment) => (
                <div key={comment.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-900">{comment.author}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(comment.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700 whitespace-pre-wrap">{comment.body}</div>
                </div>
              ))
            )}
          </div>

          {/* Add comment */}
          <div className="space-y-2">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows={3}
              disabled={saving || isPeriodLocked}
            />
            <Button
              variant="ghost"
              onClick={handleAddComment}
              disabled={!commentText.trim() || saving || isPeriodLocked}
              className="w-full"
            >
              Add Comment
            </Button>
          </div>
        </div>
      )}

      {/* Attachments section */}
      {explanation && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Attachments</div>

          {/* Attachment list */}
          <div className="space-y-2">
            {explanation.attachments.length === 0 ? (
              <div className="text-xs text-slate-500 italic">No attachments yet</div>
            ) : (
              explanation.attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span className="text-xs text-slate-700">{attachment.filename}</span>
                  </div>
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    View
                  </a>
                </div>
              ))
            )}
          </div>

          {/* Upload file */}
          <div>
            <label className="block">
              <input
                type="file"
                onChange={handleFileUpload}
                disabled={uploadingFile || saving || isPeriodLocked}
                className="hidden"
              />
              <Button
                variant="ghost"
                as="span"
                disabled={uploadingFile || saving || isPeriodLocked}
                className="w-full"
              >
                {uploadingFile ? "Uploading..." : "Upload File"}
              </Button>
            </label>
          </div>
        </div>
        )}
        </div>
        </div>
      ) : (
        /* Embedded mode - simple panel */
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Explanation</h3>
              <div className="mt-1 text-xs text-slate-600">
                {accountName} • {accountId} • {period}
              </div>
            </div>
          </div>

          {loading && (
            <div className="text-sm text-slate-600">Loading explanation...</div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="text-sm font-medium text-red-800">Error</div>
              <div className="mt-1 text-xs text-red-600">{error}</div>
            </div>
          )}

          {/* No explanation yet */}
          {!loading && !explanation && !error && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
              <div className="text-sm font-medium text-slate-700 mb-2">No explanation yet</div>
              <div className="text-xs text-slate-600 mb-4">Create an explanation for this account and period.</div>
              <Button
                onClick={handleSave}
                disabled={saving || isPeriodLocked}
                className="w-full sm:w-auto"
              >
                Create Explanation
              </Button>
            </div>
          )}

          {/* Period locked notice */}
          {isPeriodLocked && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-medium text-amber-800">Period is locked</div>
              <div className="mt-1 text-xs text-amber-700">This period is locked. Explanations are read-only.</div>
            </div>
          )}

          {/* Status and Save - only show if explanation exists or creating */}
          {(explanation || !loading) && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={saving || isPeriodLocked}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Save button */}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={handleSave}
                  disabled={saving || (explanation && status === explanation.status) || isPeriodLocked}
                  className="flex-1"
                >
                  {explanation ? "Update Status" : "Create Explanation"}
                </Button>
              </div>
            </>
          )}

          {/* Comments section */}
          {explanation && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Comments</div>

              {/* Comment list */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {explanation.comments.length === 0 ? (
                  <div className="text-xs text-slate-500 italic">No comments yet</div>
                ) : (
                  explanation.comments.map((comment) => (
                    <div key={comment.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-900">{comment.author}</span>
                        <span className="text-xs text-slate-500">
                          {new Date(comment.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs text-slate-700 whitespace-pre-wrap">{comment.body}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Add comment */}
              <div className="space-y-2">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                  disabled={saving || isPeriodLocked}
                />
                <Button
                  variant="ghost"
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || saving || isPeriodLocked}
                  className="w-full"
                >
                  Add Comment
                </Button>
              </div>
            </div>
          )}

          {/* Attachments section */}
          {explanation && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Attachments</div>

              {/* Attachment list */}
              <div className="space-y-2">
                {explanation.attachments.length === 0 ? (
                  <div className="text-xs text-slate-500 italic">No attachments yet</div>
                ) : (
                  explanation.attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <span className="text-xs text-slate-700">{attachment.filename}</span>
                      </div>
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        View
                      </a>
                    </div>
                  ))
                )}
              </div>

              {/* Upload file */}
              <div>
                <label className="block">
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    disabled={uploadingFile || saving || isPeriodLocked}
                    className="hidden"
                  />
                  <Button
                    variant="ghost"
                    as="span"
                    disabled={uploadingFile || saving || isPeriodLocked}
                    className="w-full"
                  >
                    {uploadingFile ? "Uploading..." : "Upload File"}
                  </Button>
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

