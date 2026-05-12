"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import type { Task } from "@/lib/types";
import {
  appendTaskImage,
  fetchComments,
  fetchTask,
  getUploadUrl,
  postComment,
} from "@/lib/api";
import { useState } from "react";

export function TaskDialog({
  task,
  open,
  onOpenChange,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const taskId = task?.taskId;

  const detail = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => fetchTask(taskId!),
    enabled: open && !!taskId,
  });

  const comments = useQuery({
    queryKey: ["comments", taskId],
    queryFn: () => fetchComments(taskId!),
    enabled: open && !!taskId,
  });

  const addComment = useMutation({
    mutationFn: () => postComment(taskId!, comment.trim()),
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["comments", taskId] });
      toast.success("Comment added");
    },
    onError: () => toast.error("Failed to add comment"),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!taskId) throw new Error("No task");
      const ext = file.name.split(".").pop() || "bin";
      const presign = await getUploadUrl(taskId, file.type || "application/octet-stream", ext);
      await fetch(presign.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      return appendTaskImage(taskId, presign.publicUrl);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Image attached");
    },
    onError: () => toast.error("Upload failed (check S3 CORS and IAM)"),
  });

  const t = detail.data ?? task;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {!t ? (
          <div className="text-sm text-muted-foreground">No task selected</div>
        ) : detail.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8">{t.title}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="capitalize">
                {t.status.replace("_", " ")}
              </Badge>
              <Badge className="capitalize">{t.priority}</Badge>
              <Badge variant="outline">Team {t.teamId}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{t.description}</p>
            {t.deadline ? (
              <p className="text-xs text-muted-foreground">Deadline: {new Date(t.deadline).toLocaleString()}</p>
            ) : null}

            <div className="space-y-2">
              <p className="text-sm font-medium">Images</p>
              {t.imageUrls?.length ? (
                <div className="grid grid-cols-2 gap-2">
                  {t.imageUrls.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="" className="rounded-md border border-white/10" />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No images yet.</p>
              )}
              <input
                type="file"
                accept="image/*"
                className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary-foreground"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate(f);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="space-y-2 border-t border-white/10 pt-4">
              <p className="text-sm font-medium">Comments</p>
              {comments.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-white/10 p-2">
                  {(comments.data ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No comments yet.</p>
                  ) : (
                    (comments.data ?? []).map((c) => (
                      <div key={c.commentId} className="rounded-md bg-white/5 p-2 text-sm">
                        <div className="text-[11px] text-muted-foreground">
                          {c.userId} · {new Date(c.createdAt).toLocaleString()}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap">{c.text}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
              <Textarea
                placeholder="Write a comment…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button
                disabled={!comment.trim() || addComment.isPending}
                onClick={() => addComment.mutate()}
              >
                Post comment
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
