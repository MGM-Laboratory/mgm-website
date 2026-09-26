"use client";

import "./builder/builder.css";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type { FormDocument, FormRecord, FormSummary } from "@repo/shared";

import { FormsApiError, formsAdminApi } from "@/lib/forms/admin-api";
import { blankDocument } from "@/lib/forms/builder-document";
import { parseTemplateDocument } from "@/lib/forms/builder-templates";

import { FormBuilderLoader, type BuilderTab } from "./builder/form-builder";
import { FormsList, type FormsListAction } from "./builder/forms-list";
import { ImportDialog, TemplateGallery, type GalleryChoice } from "./builder/template-gallery";
import { ConfirmDialog } from "./builder/ui";
import type { FormTemplate } from "./templates/types";

export type FormsStudioProps = {
  initialForms: FormSummary[];
  canWrite: boolean;
  canDelete: boolean;
  canReadLinks: boolean;
  canWriteLinks: boolean;
};

function summarize(record: FormRecord): FormSummary {
  const { document, ...rest } = record;
  return {
    ...rest,
    title: document.title,
    theme: document.design.theme,
    questionCount: document.fields.filter(
      (field) =>
        ![
          "heading",
          "paragraph",
          "image",
          "video",
          "divider",
          "callout",
          "quote",
          "spacer",
          "page_break",
          "hidden",
        ].includes(field.type),
    ).length,
  };
}

function message(error: unknown, fallback: string) {
  return error instanceof FormsApiError || error instanceof Error ? error.message : fallback;
}

type Open = { id: string; tab: BuilderTab; record?: FormRecord };

/**
 * The Forms workspace: the forms list (with the template gallery and JSON
 * import), and each form's builder with its share, responses and analytics
 * tabs. Full-bleed, like the events workspace.
 */
export function FormsStudio({
  canDelete,
  canReadLinks,
  canWrite,
  canWriteLinks,
  initialForms,
}: FormsStudioProps) {
  const [forms, setForms] = useState(initialForms);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);
  const [gallery, setGallery] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; title: string; responses: number } | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { forms: next } = await formsAdminApi.list();
      setForms(next);
    } catch {
      // The server-rendered list stays; a toast would be noise on every visit.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fresh counts when the workspace opens (the first paint used the server list).
    let cancelled = false;
    formsAdminApi
      .list()
      .then(({ forms: next }) => {
        if (!cancelled) setForms(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const upsert = useCallback((record: FormRecord) => {
    const summary = summarize(record);
    setForms((current) => [summary, ...current.filter((form) => form.id !== record.id)]);
  }, []);

  const create = async (document: FormDocument) => {
    setBusy(true);
    try {
      const { form } = await formsAdminApi.create({ document, status: "draft" });
      upsert(form);
      setGallery(false);
      setImporting(false);
      setOpen({ id: form.id, tab: "build", record: form });
    } catch (error) {
      toast.error("The form could not be created.", { description: message(error, "Try again.") });
    } finally {
      setBusy(false);
    }
  };

  const choose = (choice: GalleryChoice) => {
    if (choice.kind === "blank") void create(blankDocument());
    else if (choice.kind === "document") void create(structuredClone(choice.document));
    else pickTemplate(choice.template);
  };

  const pickTemplate = (template: FormTemplate | null) => {
    if (!template) {
      void create(blankDocument());
      return;
    }
    const document = parseTemplateDocument(template.document);
    if (!document) {
      toast.error("That template could not be read.");
      return;
    }
    void create(structuredClone(document));
  };

  const duplicate = async (id: string) => {
    try {
      const { form } = await formsAdminApi.duplicate(id);
      upsert(form);
      toast.success(`Duplicated as “${form.document.title}”`, {
        action: {
          label: "Open",
          onClick: () => {
            setOpen({ id: form.id, tab: "build", record: form });
          },
        },
      });
    } catch (error) {
      toast.error("The form could not be duplicated.", {
        description: message(error, "Try again."),
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await formsAdminApi.remove(deleting.id);
      setForms((current) => current.filter((form) => form.id !== deleting.id));
      if (open?.id === deleting.id) setOpen(null);
      toast.success(`Deleted “${deleting.title}”`);
      setDeleting(null);
    } catch (error) {
      toast.error("The form could not be deleted.", { description: message(error, "Try again.") });
    } finally {
      setBusy(false);
    }
  };

  const onAction = (action: FormsListAction, form: FormSummary) => {
    const link = `${window.location.origin}/forms/${form.slug}`;
    switch (action) {
      case "open":
        setOpen({ id: form.id, tab: "build" });
        break;
      case "responses":
        setOpen({ id: form.id, tab: "responses" });
        break;
      case "analytics":
        setOpen({ id: form.id, tab: "analytics" });
        break;
      case "copy":
        void navigator.clipboard
          .writeText(link)
          .then(() =>
            toast.success("Link copied", {
              description: form.status === "draft" ? "It works once the form is published." : link,
            }),
          )
          .catch(() => toast.error("The clipboard refused the link.", { description: link }));
        break;
      case "live":
        window.open(link, "_blank", "noopener");
        break;
      case "duplicate":
        void duplicate(form.id);
        break;
      case "delete":
        setDeleting({
          id: form.id,
          title: form.title || "Untitled form",
          responses: form.stats.responses,
        });
        break;
    }
  };

  const deleteDialog = deleting ? (
    <ConfirmDialog
      body={
        <>
          <p>
            “{deleting.title}” and{" "}
            {deleting.responses
              ? `its ${deleting.responses.toLocaleString("en-US")} responses, their uploaded files and its analytics`
              : "its analytics"}{" "}
            will be deleted for good. Its public link stops working.
          </p>
        </>
      }
      busy={busy}
      confirmLabel="Delete form"
      onCancel={() => {
        setDeleting(null);
      }}
      onConfirm={() => void confirmDelete()}
      title="Delete this form?"
    />
  ) : null;

  if (open) {
    return (
      <>
        <FormBuilderLoader
          canDelete={canDelete}
          canReadLinks={canReadLinks}
          canWrite={canWrite}
          canWriteLinks={canWriteLinks}
          formId={open.id}
          initialRecord={open.record}
          initialTab={open.tab}
          key={open.id}
          onBack={() => {
            setOpen(null);
            void refresh();
          }}
          onDelete={(record) => {
            setDeleting({
              id: record.id,
              title: record.document.title,
              responses: record.stats.responses,
            });
          }}
          onDuplicate={(record) => void duplicate(record.id)}
          onRecordChange={upsert}
        />
        {deleteDialog}
      </>
    );
  }

  return (
    <>
      <FormsList
        canDelete={canDelete}
        canWrite={canWrite}
        forms={forms}
        loading={loading}
        onAction={onAction}
        onImport={() => {
          setImporting(true);
        }}
        onNew={() => {
          setGallery(true);
        }}
        onPickTemplate={pickTemplate}
      />
      {gallery ? (
        <TemplateGallery
          busy={busy}
          onChoose={choose}
          onClose={() => {
            setGallery(false);
          }}
          onImport={() => {
            setGallery(false);
            setImporting(true);
          }}
        />
      ) : null}
      {importing ? (
        <ImportDialog
          busy={busy}
          onClose={() => {
            setImporting(false);
          }}
          onImport={(document) => void create(document)}
        />
      ) : null}
      {deleteDialog}
    </>
  );
}
