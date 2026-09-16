"use client";

import {
  ArrowSquareOut,
  Books,
  Briefcase,
  CalendarBlank,
  Camera,
  CaretUpDown,
  Check,
  Envelope,
  EnvelopeOpen,
  FloppyDisk,
  Flask,
  GraduationCap,
  House,
  ImageSquare,
  Lock,
  MagnifyingGlass,
  Newspaper,
  Plus,
  ShieldCheck,
  SignOut,
  Star,
  Trash,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import Cropper, { type Area } from "react-easy-crop";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MEMBER_DIVISIONS, MEMBERS, type Member } from "@/data/members";
import {
  can,
  type AdminPageId,
  type AdminViewer,
  type CmsAdminRecord,
} from "@/lib/admin-permissions";
import { AdminManagementPanel } from "@/components/admin/admin-management-panel";
import { ArticleEditor } from "@/components/admin/article-cms-editor";
import { ContactSettingsEditor } from "@/components/admin/contact-settings-editor";
import { ProjectEditor } from "@/components/admin/project-cms-editor";
import { PublicationEditor } from "@/components/admin/publication-cms-editor";
import { ResearchEditor } from "@/components/admin/research-cms-editor";
import {
  draftToMember,
  memberToDraft,
  type CmsAchievement,
  type CmsCertificate,
  type CmsEducation,
  type CmsExperience,
  type CmsLanguage,
  type CmsLink,
  type CmsMemberProfile,
  type CmsMemberRecord,
  type MemberDraft,
} from "@/lib/member-cms";
import { useMemberRecords } from "@/hooks/use-member-records";
import { useArticleRecords } from "@/hooks/use-article-records";
import { useProjectRecords } from "@/hooks/use-project-records";
import { usePublicationRecords } from "@/hooks/use-publication-records";
import { useResearchRecords } from "@/hooks/use-research-records";
import { CareersCmsStudio } from "@/components/admin/careers-cms-studio";
import { ContactInquiriesInbox } from "@/components/admin/contact-inquiries-inbox";
import { EventsCmsStudio } from "@/components/admin/events-cms-studio";
import type { CmsArticleRecord } from "@/lib/article-cms";
import type { CmsProjectRecord } from "@/lib/project-cms";
import type { CmsPublicationRecord } from "@/lib/publication-cms";
import type { CmsContactInquiryRecord } from "@/lib/contact-inquiries-cms";
import type { CmsJobApplicationRecord, CmsJobRecord } from "@/lib/career-cms";
import type { CmsResearchRecord } from "@/lib/research-cms";
import type { CmsEventRecord, CmsEventRegistrationRecord } from "@/lib/events-cms";

type EditorTab = "profile" | "experience" | "education" | "credentials";
type EditorialSection =
  | "overview"
  | "articles"
  | "projects"
  | "publications"
  | "research"
  | "members"
  | "careers"
  | "contact"
  | "contact-inquiries"
  | "events"
  | "administration";
type DateValue = { month: number; year: number };

const TABS: { id: EditorTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "experience", label: "Experience" },
  { id: "education", label: "Education" },
  { id: "credentials", label: "Credentials" },
];

const EDITORIAL_SECTIONS: { id: Exclude<EditorialSection, "overview">; label: string }[] = [
  { id: "articles", label: "Articles" },
  { id: "projects", label: "Projects" },
  { id: "publications", label: "Publications" },
  { id: "research", label: "Research" },
  { id: "members", label: "Member" },
  { id: "careers", label: "Careers" },
  { id: "contact", label: "Contact Settings" },
  { id: "contact-inquiries", label: "Contact Inquiries" },
  { id: "events", label: "Events" },
];

const WORKSPACES: { id: EditorialSection; label: string; tone: string }[] = [
  { id: "overview", label: "Overview", tone: "text-brand-blue" },
  { id: "articles", label: "Articles", tone: "text-brand-yellow" },
  { id: "projects", label: "Projects", tone: "text-brand-red" },
  { id: "publications", label: "Publications", tone: "text-brand-green" },
  { id: "research", label: "Research", tone: "text-brand-blue" },
  { id: "members", label: "Member", tone: "text-brand-red" },
  { id: "careers", label: "Careers", tone: "text-brand-yellow" },
  { id: "contact", label: "Contact Settings", tone: "text-brand-green" },
  { id: "contact-inquiries", label: "Contact Inquiries", tone: "text-brand-green" },
  { id: "events", label: "Events", tone: "text-brand-green" },
  { id: "administration", label: "Admin Management", tone: "text-brand-blue" },
];

const LIVE_WORKSPACES = new Set<EditorialSection>([
  "members",
  "articles",
  "publications",
  "careers",
  "research",
  "contact",
  "contact-inquiries",
  "projects",
  "events",
]);

/** Each editorial workspace maps to the permission page that gates it. */
const SECTION_PAGE: Partial<Record<EditorialSection, AdminPageId>> = {
  articles: "articles",
  publications: "publications",
  members: "members",
  projects: "projects",
  research: "research",
  careers: "careers",
  contact: "contact",
  "contact-inquiries": "contact-inquiries",
  events: "events",
};

export function WorkspaceIcon({ section, size = 18 }: { section: EditorialSection; size?: number }) {
  const iconMap = {
    articles: Newspaper,
    projects: Briefcase,
    publications: Books,
    research: Flask,
    members: UsersThree,
    careers: GraduationCap,
    contact: Envelope,
    'contact-inquiries': EnvelopeOpen,
    events: CalendarBlank,
    administration: ShieldCheck,
  } as const;

  const IconComponent = iconMap[section] || House;

  return <IconComponent size={size} weight="duotone" />;
}

const emptyProfile = (): CmsMemberProfile => ({
  achievements: [],
  certificates: [],
  education: [],
  experience: [],
  languages: [],
  links: [],
  projects: [],
  skills: [],
});

function asDate(value?: DateValue) {
  if (!value) return "";
  return `${value.year}-${String(value.month + 1).padStart(2, "0")}`;
}

function fromDate(value: string): DateValue | undefined {
  const [year, month] = value.split("-").map(Number);
  return year && month ? { month: month - 1, year } : undefined;
}

function copyProfile(profile?: CmsMemberProfile) {
  return structuredClone(profile ?? emptyProfile());
}

function CropPreview({ source, profile }: { profile: CmsMemberProfile; source?: string }) {
  const position = profile.photoPosition ?? { x: 50, y: 50, zoom: 1 };
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#e8ecf4] dark:bg-[#1a202b]">
      {source ? (
        // Using a native image here keeps the in-editor crop preview instant.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="Selected member portrait"
          className="absolute inset-0 size-full object-cover"
          src={source}
          style={{
            objectPosition: `${position.x}% ${position.y}%`,
            transform: `scale(${position.zoom})`,
          }}
        />
      ) : (
        <div className="grid h-full place-items-center text-[#6d778d]">
          <ImageSquare size={36} weight="duotone" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-3 rounded-xl border border-white/75 shadow-[inset_0_0_0_1px_rgba(10,20,38,0.12)]" />
    </div>
  );
}

async function cropPortrait(source: string, crop: Area) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("This image could not be prepared."));
    element.src = source;
  });
  // First create a high-quality working frame. The result below is then
  // compressed adaptively, leaving generous space beneath the API's upload
  // limit even for detailed photographs and transparent cut-outs.
  const workingScale = Math.min(1, 1440 / Math.max(crop.width, crop.height));
  const workingCanvas = document.createElement("canvas");
  workingCanvas.width = Math.max(1, Math.round(crop.width * workingScale));
  workingCanvas.height = Math.max(1, Math.round(crop.height * workingScale));
  const workingContext = workingCanvas.getContext("2d");
  if (!workingContext) throw new Error("Your browser could not prepare this image.");
  workingContext.imageSmoothingEnabled = true;
  workingContext.imageSmoothingQuality = "high";
  workingContext.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    workingCanvas.width,
    workingCanvas.height,
  );
  const pixels = workingContext.getImageData(0, 0, workingCanvas.width, workingCanvas.height).data;
  const hasTransparency = pixels.some((_, index) => index % 4 === 3 && pixels[index] < 255);
  const contentType = hasTransparency ? "image/webp" : "image/jpeg";
  const maxBytes = 4 * 1024 * 1024;
  let smallest = "";

  for (const scale of [1, 0.84, 0.7]) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(workingCanvas.width * scale));
    canvas.height = Math.max(1, Math.round(workingCanvas.height * scale));
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(workingCanvas, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.88, 0.8, 0.72]) {
      const encoded = canvas.toDataURL(contentType, quality);
      if (!smallest || encoded.length < smallest.length) smallest = encoded;
      // A base64 data URL adds roughly one third overhead; 4 MiB decoded is
      // safely under the 6 MiB API limit and avoids request-size failures.
      if (Math.ceil((encoded.length - encoded.indexOf(",") - 1) * 0.75) <= maxBytes) {
        return encoded;
      }
    }
  }

  if (smallest) return smallest;
  throw new Error("This image could not be compressed. Please choose another image.");
}

function PhotoEditorDialog({
  image,
  onClose,
  onConfirm,
}: {
  image: string;
  onClose: () => void;
  onConfirm: (portrait: string) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area>();
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isApplying) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isApplying, onClose]);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const apply = async () => {
    if (!croppedAreaPixels) return;
    setIsApplying(true);
    try {
      onConfirm(await cropPortrait(image, croppedAreaPixels));
    } catch (error) {
      toast.error("Photo could not be prepared", {
        description: error instanceof Error ? error.message : "Please try another image.",
      });
      setIsApplying(false);
    }
  };

  return (
    <div
      aria-modal="true"
      aria-labelledby="portrait-editor-title"
      className="fixed inset-0 z-[100] grid place-items-center bg-[#10131b]/70 p-4 backdrop-blur-sm"
      onMouseDown={() => !isApplying && onClose()}
      role="dialog"
    >
      <section
        className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/15 bg-[#f8f9fc] text-[#171b25] shadow-[0_28px_90px_-30px_rgba(0,0,0,0.7)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-5 border-b border-[#dfe4ee] px-5 py-4 sm:px-7">
          <div>
            <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-blue uppercase">
              Portrait editor
            </p>
            <h2
              id="portrait-editor-title"
              className="mt-1 font-display text-2xl font-semibold tracking-[-0.04em]"
            >
              Frame the member photo
            </h2>
            <p className="mt-1 text-sm text-[#687187]">
              Drag to reposition, then use zoom for the final crop.
            </p>
          </div>
          <button
            aria-label="Close photo editor"
            className="rounded-xl p-2 text-[#687187] transition hover:bg-[#e9edf5] hover:text-[#171b25]"
            disabled={isApplying}
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>
        <div className="grid gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_12rem] sm:p-7">
          <div className="relative aspect-[4/5] min-h-[22rem] overflow-hidden rounded-2xl bg-[#151b27] shadow-inner">
            <Cropper
              aspect={4 / 5}
              crop={crop}
              cropShape="rect"
              image={image}
              maxZoom={3}
              minZoom={1}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              restrictPosition
              showGrid={false}
              zoom={zoom}
            />
          </div>
          <div className="flex flex-col justify-between gap-5">
            <Field label="Zoom">
              <input
                aria-label="Photo zoom"
                className="h-10 w-full accent-brand-blue"
                max="3"
                min="1"
                onChange={(event) => setZoom(Number(event.target.value))}
                step="0.01"
                type="range"
                value={zoom}
              />
            </Field>
            <p className="rounded-2xl bg-brand-blue/[0.07] p-4 text-sm leading-6 text-[#55627a]">
              The public portrait uses a 4:5 frame. Your crop is compressed for quick loading before
              it is uploaded.
            </p>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#171b25] px-4 text-sm font-semibold text-white transition hover:bg-brand-blue active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
              disabled={!croppedAreaPixels || isApplying}
              onClick={() => void apply()}
              type="button"
            >
              {isApplying ? "Preparing…" : "Use this photo"}
              <Check size={17} weight="bold" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";
const textareaClass =
  "min-h-28 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 py-2.5 text-sm leading-6 text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";

function EditRow({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <article className="relative rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
      <button
        aria-label="Remove item"
        className="absolute right-3 top-3 rounded-lg p-1.5 text-[#7e899e] transition hover:bg-brand-red-50 hover:text-brand-red dark:text-white/40 dark:hover:bg-brand-red/15"
        onClick={onRemove}
        type="button"
      >
        <Trash size={16} />
      </button>
      <div className="pr-7">{children}</div>
    </article>
  );
}

export function MemberCmsStudio({
  initialArticles = [],
  initialPublications = [],
  initialAdmins = [],
  initialJobs = [],
  initialApplications = [],
  initialResearch = [],
  initialProjects = [],
  initialEvents = [],
  initialEventRegistrations = [],
  initialContactInquiries = [],
  paperLimitBytes = 209_715_200,
  videoLimitBytes = 524_288_000,
  session,
}: {
  initialArticles?: CmsArticleRecord[];
  initialPublications?: CmsPublicationRecord[];
  initialAdmins?: CmsAdminRecord[];
  initialJobs?: CmsJobRecord[];
  initialApplications?: CmsJobApplicationRecord[];
  initialResearch?: CmsResearchRecord[];
  initialProjects?: CmsProjectRecord[];
  initialEvents?: CmsEventRecord[];
  initialEventRegistrations?: CmsEventRegistrationRecord[];
  initialContactInquiries?: CmsContactInquiryRecord[];
  paperLimitBytes?: number;
  videoLimitBytes?: number;
  session: AdminViewer;
}) {
  const { members, ready, records, setRecords } = useMemberRecords();
  const {
    ready: articlesReady,
    records: articleRecords,
    setRecords: setArticleRecords,
  } = useArticleRecords(initialArticles, "/api/admin/articles");
  const {
    ready: publicationsReady,
    records: publicationRecords,
    setRecords: setPublicationRecords,
  } = usePublicationRecords(initialPublications);
  const {
    ready: researchReady,
    records: researchRecords,
    setRecords: setResearchRecords,
  } = useResearchRecords(initialResearch);
  const {
    ready: projectsReady,
    records: projectRecords,
    setRecords: setProjectRecords,
  } = useProjectRecords(initialProjects);
  const [contactInquiries, setContactInquiries] =
    useState<CmsContactInquiryRecord[]>(initialContactInquiries);
  const [section, setSection] = useState<EditorialSection>("overview");
  const [activeTab, setActiveTab] = useState<EditorTab>("profile");
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const [showNew, setShowNew] = useState(false);
  const [newKey, setNewKey] = useState(0);
  const [articleQuery, setArticleQuery] = useState("");
  const [selectedArticleSlug, setSelectedArticleSlug] = useState<string>();
  const [showNewArticle, setShowNewArticle] = useState(false);
  const [articleNewKey, setArticleNewKey] = useState(0);
  const [publicationQuery, setPublicationQuery] = useState("");
  const [selectedPublicationSlug, setSelectedPublicationSlug] = useState<string>();
  const [showNewPublication, setShowNewPublication] = useState(false);
  const [publicationNewKey, setPublicationNewKey] = useState(0);
  const [researchQuery, setResearchQuery] = useState("");
  const [selectedResearchSlug, setSelectedResearchSlug] = useState<string>();
  const [showNewResearch, setShowNewResearch] = useState(false);
  const [researchNewKey, setResearchNewKey] = useState(0);
  const [projectQuery, setProjectQuery] = useState("");
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string>();
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectNewKey, setProjectNewKey] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const workspacePickerRef = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<AdminViewer>(session);

  // Refresh the viewer on mount so permission changes made elsewhere in the
  // panel re-gate this session without a full reload.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me")
      .then((response) => (response.ok ? response.json() : undefined))
      .then((next: AdminViewer | undefined) => {
        if (!cancelled && next) setViewer(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const canAccess = (target: EditorialSection) => {
    if (target === "overview") return true;
    if (viewer.role === "superadmin") return true;
    const page = SECTION_PAGE[target];
    return page !== undefined && can(viewer.permissions, page, "read");
  };

  const selected = useMemo(
    () => members.find((member) => member.slug === selectedSlug),
    [members, selectedSlug],
  );
  const selectedRecord = useMemo(
    () => records.find((record) => record.slug === selectedSlug),
    [records, selectedSlug],
  );
  const visibleMembers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return members;
    return members.filter((member) =>
      [member.name, member.nickname, member.division, ...member.labFocus]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [members, query]);

  const sortedArticleRecords = useMemo(
    () =>
      [...articleRecords].sort((left, right) =>
        right.article.date.localeCompare(left.article.date),
      ),
    [articleRecords],
  );
  const visibleArticleRecords = useMemo(() => {
    const needle = articleQuery.trim().toLocaleLowerCase();
    if (!needle) return sortedArticleRecords;
    return sortedArticleRecords.filter((record) =>
      [record.article.title, record.article.slug, ...record.article.categories]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [articleQuery, sortedArticleRecords]);

  const sortedPublicationRecords = useMemo(
    () =>
      [...publicationRecords].sort((left, right) =>
        right.publication.date.localeCompare(left.publication.date),
      ),
    [publicationRecords],
  );
  const visiblePublicationRecords = useMemo(() => {
    const needle = publicationQuery.trim().toLocaleLowerCase();
    if (!needle) return sortedPublicationRecords;
    return sortedPublicationRecords.filter((record) =>
      [
        record.publication.title,
        record.publication.slug,
        record.publication.journal,
        ...record.publication.authors.map((author) => author.name),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [publicationQuery, sortedPublicationRecords]);

  const sortedResearchRecords = useMemo(
    () =>
      [...researchRecords].sort((left, right) =>
        (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
      ),
    [researchRecords],
  );
  const visibleResearchRecords = useMemo(() => {
    const needle = researchQuery.trim().toLocaleLowerCase();
    if (!needle) return sortedResearchRecords;
    return sortedResearchRecords.filter((record) =>
      [record.research.title, record.research.slug, record.research.question]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [researchQuery, sortedResearchRecords]);

  const sortedProjectRecords = useMemo(
    () =>
      [...projectRecords].sort((left, right) =>
        (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
      ),
    [projectRecords],
  );
  const visibleProjectRecords = useMemo(() => {
    const needle = projectQuery.trim().toLocaleLowerCase();
    if (!needle) return sortedProjectRecords;
    return sortedProjectRecords.filter((record) =>
      [record.project.title, record.project.slug, ...record.project.techStack]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [projectQuery, sortedProjectRecords]);

  const confirmDiscard = () =>
    !hasUnsavedChanges || window.confirm("You have unsaved changes. Discard them and continue?");
  const selectMember = (member: Member) => {
    if ((showNew || member.slug !== selectedSlug) && !confirmDiscard()) return;
    setHasUnsavedChanges(false);
    setShowNew(false);
    setSelectedSlug(member.slug);
  };

  const startNew = () => {
    if (!confirmDiscard()) return;
    setHasUnsavedChanges(false);
    setSelectedSlug(undefined);
    setShowNew(true);
    setNewKey((current) => current + 1);
    setActiveTab("profile");
  };
  const selectArticle = (slug: string) => {
    if ((showNewArticle || slug !== selectedArticleSlug) && !confirmDiscard()) return;
    setHasUnsavedChanges(false);
    setShowNewArticle(false);
    setSelectedArticleSlug(slug);
  };
  const startNewArticle = () => {
    if (!confirmDiscard()) return;
    setHasUnsavedChanges(false);
    setSelectedArticleSlug(undefined);
    setShowNewArticle(true);
    setArticleNewKey((current) => current + 1);
  };
  const selectPublication = (slug: string) => {
    if ((showNewPublication || slug !== selectedPublicationSlug) && !confirmDiscard()) return;
    setHasUnsavedChanges(false);
    setShowNewPublication(false);
    setSelectedPublicationSlug(slug);
  };
  const startNewPublication = () => {
    if (!confirmDiscard()) return;
    setHasUnsavedChanges(false);
    setSelectedPublicationSlug(undefined);
    setShowNewPublication(true);
    setPublicationNewKey((current) => current + 1);
  };
  const selectResearch = (slug: string) => {
    if ((showNewResearch || slug !== selectedResearchSlug) && !confirmDiscard()) return;
    setHasUnsavedChanges(false);
    setShowNewResearch(false);
    setSelectedResearchSlug(slug);
  };
  const startNewResearch = () => {
    if (!confirmDiscard()) return;
    setHasUnsavedChanges(false);
    setSelectedResearchSlug(undefined);
    setShowNewResearch(true);
    setResearchNewKey((current) => current + 1);
  };
  const selectProject = (slug: string) => {
    if ((showNewProject || slug !== selectedProjectSlug) && !confirmDiscard()) return;
    setHasUnsavedChanges(false);
    setShowNewProject(false);
    setSelectedProjectSlug(slug);
  };
  const startNewProject = () => {
    if (!confirmDiscard()) return;
    setHasUnsavedChanges(false);
    setSelectedProjectSlug(undefined);
    setShowNewProject(true);
    setProjectNewKey((current) => current + 1);
  };
  const changeSection = (nextSection: EditorialSection) => {
    if (nextSection !== section && !confirmDiscard()) return;
    if (nextSection !== section) setHasUnsavedChanges(false);
    setSection(nextSection);
    setWorkspaceOpen(false);
  };
  const currentMember = selected ?? members[0] ?? MEMBERS[0];
  const activeWorkspace = WORKSPACES.find((workspace) => workspace.id === section) ?? WORKSPACES[0];
  const selectedArticle = sortedArticleRecords.find(
    (record) => record.slug === selectedArticleSlug,
  );
  const selectedPublication = sortedPublicationRecords.find(
    (record) => record.slug === selectedPublicationSlug,
  );
  const selectedResearch = sortedResearchRecords.find(
    (record) => record.slug === selectedResearchSlug,
  );
  const selectedProject = sortedProjectRecords.find(
    (record) => record.slug === selectedProjectSlug,
  );

  useEffect(() => {
    const closePicker = (event: MouseEvent) => {
      if (event.target instanceof Node && !workspacePickerRef.current?.contains(event.target)) {
        setWorkspaceOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkspaceOpen(false);
    };
    document.addEventListener("mousedown", closePicker);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closePicker);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <main className="admin-shell min-h-[100dvh] bg-[#f5f7fb] text-[#171b25] dark:bg-[#0f1117] dark:text-white">
      <header className="sticky top-0 z-40 border-b border-[#dee4ef] bg-[#f5f7fb]/95 px-5 py-3 backdrop-blur dark:border-white/10 dark:bg-[#0f1117]/95 sm:px-7">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4">
          <div className="relative min-w-0" ref={workspacePickerRef}>
            <button
              aria-expanded={workspaceOpen}
              aria-haspopup="menu"
              className="group flex min-w-[14rem] items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/15 dark:hover:bg-white/[0.06]"
              onClick={() => setWorkspaceOpen((current) => !current)}
              type="button"
            >
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-xl bg-white ${activeWorkspace.tone} shadow-[0_8px_20px_-16px_rgba(20,32,58,0.55)] dark:bg-white/10`}
              >
                <WorkspaceIcon section={section} size={21} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-lg font-semibold tracking-[-0.04em]">
                  {activeWorkspace.label}
                </span>
                <span className="block font-mono text-[10px] tracking-[0.13em] text-[#768096] uppercase dark:text-white/40">
                  MGM Laboratory CMS
                </span>
              </span>
              <CaretUpDown
                aria-hidden="true"
                className="mr-1 shrink-0 text-[#768096] transition group-aria-expanded:rotate-180 dark:text-white/45"
                size={16}
              />
            </button>
            {workspaceOpen ? (
              <div
                aria-label="Editorial workspaces"
                className="absolute left-0 top-[calc(100%+0.55rem)] z-50 w-[min(20rem,calc(100vw-2.5rem))] rounded-2xl border border-[#dfe4ee] bg-white p-2 shadow-[0_24px_55px_-28px_rgba(20,32,58,0.36)] dark:border-white/10 dark:bg-[#171b25]"
                role="menu"
              >
                <p className="px-3 pb-2 pt-1 font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
                  Switch workspace
                </p>
                <div className="space-y-1">
                  {WORKSPACES.filter((workspace) => canAccess(workspace.id)).map((workspace) => {
                    const available =
                      LIVE_WORKSPACES.has(workspace.id) || workspace.id === "administration";
                    return (
                      <button
                        aria-current={workspace.id === section ? "page" : undefined}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${workspace.id === section ? "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/20" : "text-[#4f5a6f] hover:bg-[#f5f7fb] dark:text-white/65 dark:hover:bg-white/[0.06]"}`}
                        key={workspace.id}
                        onClick={() => changeSection(workspace.id)}
                        role="menuitem"
                        type="button"
                      >
                        <span className={workspace.tone}>
                          <WorkspaceIcon section={workspace.id} size={19} />
                        </span>
                        <span className="flex-1">{workspace.label}</span>
                        <span
                          className={`font-mono text-[10px] font-normal ${available ? "text-brand-green" : "text-[#8993a7] dark:text-white/30"}`}
                        >
                          {available ? "LIVE" : "SOON"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-[#dfe4ee] bg-white py-1 pr-3 pl-1 sm:flex dark:border-white/10 dark:bg-white/[0.06]">
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] uppercase ${viewer.role === "superadmin" ? "bg-brand-blue text-white" : "bg-brand-green text-white"}`}
              >
                {viewer.role === "superadmin" ? "Superadmin" : "Admin"}
              </span>
              <span className="text-sm font-semibold text-[#3e4859] dark:text-white/85">
                {viewer.name}
              </span>
            </div>
            <form
              action="/api/admin/logout"
              method="post"
              onSubmit={(event) => {
                if (!confirmDiscard()) event.preventDefault();
              }}
            >
              <button
                className="inline-flex rounded-lg p-2 text-[#667187] transition hover:bg-white hover:text-brand-red dark:text-white/55 dark:hover:bg-white/10"
                title="Sign out"
                type="submit"
              >
                <SignOut size={19} />
              </button>
            </form>
          </div>
        </div>
      </header>

      {!canAccess(section) ? (
        <DeniedScreen onBack={() => changeSection("overview")} />
      ) : section === "careers" ? (
        // The careers workspace renders its own full-bleed layout: the job
        // openings editor and the applications inbox, no aside rail.
        <CareersCmsStudio initialApplications={initialApplications} initialJobs={initialJobs} />
      ) : section === "events" ? (
        // Same full-bleed, no-aside-rail shape as careers: events editor and
        // registrations inbox, tab-switched inside the studio itself.
        <EventsCmsStudio
          initialEvents={initialEvents}
          initialRegistrations={initialEventRegistrations}
        />
      ) : section === "contact-inquiries" ? ( // NOSONAR: won't-fix, see docs/repo-history.md
        // Full-bleed, no-aside-rail: the inbox is the whole workspace, same
        // shape as careers/events' registrations panes.
        <div className="mx-auto max-w-[1680px] p-5 sm:p-8 lg:p-10">
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-green uppercase">
            Contact Inquiries
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            Contact Inquiries
          </h1>
          <p className="mt-2 text-sm text-[#69748a] dark:text-white/50">
            Every /contact form submission, saved the moment it arrives — independent of whether the
            reply email actually sends.
          </p>
          <ContactInquiriesInbox
            readOnly={viewer.role !== "superadmin"}
            records={contactInquiries}
            setRecords={setContactInquiries}
          />
        </div>
      ) : (
        <div className="mx-auto grid max-w-[1680px] lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="border-b border-[#dee4ef] p-4 dark:border-white/10 lg:sticky lg:top-[69px] lg:h-[calc(100dvh-69px)] lg:overflow-hidden lg:border-b-0 lg:border-r">
            {section === "articles" ? (
              <div className="flex min-h-0 flex-col lg:h-full">
                <div className="shrink-0">
                  <div className="relative">
                    <MagnifyingGlass
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
                      size={17}
                    />
                    <input
                      className={`${inputClass} pl-9`}
                      onChange={(event) => setArticleQuery(event.target.value)}
                      placeholder="Find an article"
                      value={articleQuery}
                    />
                  </div>
                  <button
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-blue/45 bg-brand-blue/[0.04] text-sm font-semibold text-brand-blue transition hover:bg-brand-blue hover:text-white active:scale-[0.98]"
                    onClick={startNewArticle}
                    type="button"
                  >
                    <Plus size={17} weight="bold" />
                    New article
                  </button>
                  <p className="mt-6 px-2 font-mono text-[10px] font-bold tracking-[0.16em] text-[#7e899d] uppercase dark:text-white/35">
                    Editorial · {articlesReady ? articleRecords.length : "…"}
                  </p>
                </div>
                <nav className="mt-2 min-h-0 space-y-1 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                  {visibleArticleRecords.map((record) => (
                    <button
                      className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${record.slug === selectedArticleSlug && !showNewArticle ? "bg-white shadow-[0_10px_24px_-20px_rgba(20,32,58,0.5)] dark:bg-white/10" : "hover:bg-white/70 dark:hover:bg-white/[0.05]"}`}
                      key={record.slug}
                      onClick={() => selectArticle(record.slug)}
                      type="button"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {record.article.title || "Untitled article"}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-[#778299] dark:text-white/45">
                          <span>{record.article.date}</span>
                          {record.article.draft ? (
                            <span className="rounded-full bg-brand-yellow-50 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-[#a97b1c] uppercase">
                              Draft
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  ))}
                  {!visibleArticleRecords.length ? (
                    <p className="px-2 py-4 text-xs leading-5 text-[#9ba4b5]">
                      No articles yet. Start one with “New article”.
                    </p>
                  ) : null}
                </nav>
              </div>
            ) : section === "publications" ? (
              <div className="flex min-h-0 flex-col lg:h-full">
                <div className="shrink-0">
                  <div className="relative">
                    <MagnifyingGlass
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
                      size={17}
                    />
                    <input
                      className={`${inputClass} pl-9`}
                      onChange={(event) => setPublicationQuery(event.target.value)}
                      placeholder="Find a publication"
                      value={publicationQuery}
                    />
                  </div>
                  <button
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-green/45 bg-brand-green/[0.04] text-sm font-semibold text-brand-green transition hover:bg-brand-green hover:text-white active:scale-[0.98]"
                    onClick={startNewPublication}
                    type="button"
                  >
                    <Plus size={17} weight="bold" />
                    New publication
                  </button>
                  <p className="mt-6 px-2 font-mono text-[10px] font-bold tracking-[0.16em] text-[#7e899d] uppercase dark:text-white/35">
                    Editorial · {publicationsReady ? publicationRecords.length : "…"}
                  </p>
                </div>
                <nav className="mt-2 min-h-0 space-y-1 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                  {visiblePublicationRecords.map((record) => (
                    <button
                      className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${record.slug === selectedPublicationSlug && !showNewPublication ? "bg-white shadow-[0_10px_24px_-20px_rgba(20,32,58,0.5)] dark:bg-white/10" : "hover:bg-white/70 dark:hover:bg-white/[0.05]"}`}
                      key={record.slug}
                      onClick={() => selectPublication(record.slug)}
                      type="button"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {record.publication.title || "Untitled publication"}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-[#778299] dark:text-white/45">
                          <span>{record.publication.date}</span>
                          {record.publication.draft ? (
                            <span className="rounded-full bg-brand-yellow-50 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-[#a97b1c] uppercase">
                              Draft
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  ))}
                  {!visiblePublicationRecords.length ? (
                    <p className="px-2 py-4 text-xs leading-5 text-[#9ba4b5]">
                      No publications yet. Start one with “New publication”.
                    </p>
                  ) : null}
                </nav>
              </div>
            ) : section === "research" ? (
              <div className="flex min-h-0 flex-col lg:h-full">
                <div className="shrink-0">
                  <div className="relative">
                    <MagnifyingGlass
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
                      size={17}
                    />
                    <input
                      className={`${inputClass} pl-9`}
                      onChange={(event) => setResearchQuery(event.target.value)}
                      placeholder="Find an initiative"
                      value={researchQuery}
                    />
                  </div>
                  <button
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-red/45 bg-brand-red/[0.04] text-sm font-semibold text-brand-red transition hover:bg-brand-red hover:text-white active:scale-[0.98]"
                    onClick={startNewResearch}
                    type="button"
                  >
                    <Plus size={17} weight="bold" />
                    New initiative
                  </button>
                  <p className="mt-6 px-2 font-mono text-[10px] font-bold tracking-[0.16em] text-[#7e899d] uppercase dark:text-white/35">
                    Initiatives · {researchReady ? researchRecords.length : "…"}
                  </p>
                </div>
                <nav className="mt-2 min-h-0 space-y-1 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                  {visibleResearchRecords.map((record) => (
                    <button
                      className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${record.slug === selectedResearchSlug && !showNewResearch ? "bg-white shadow-[0_10px_24px_-20px_rgba(20,32,58,0.5)] dark:bg-white/10" : "hover:bg-white/70 dark:hover:bg-white/[0.05]"}`}
                      key={record.slug}
                      onClick={() => selectResearch(record.slug)}
                      type="button"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {record.research.title || "Untitled initiative"}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-[#778299] dark:text-white/45">
                          <span className="truncate">
                            {record.research.startDate || record.research.status}
                          </span>
                          {record.research.draft ? (
                            <span className="shrink-0 rounded-full bg-brand-yellow-50 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-[#a97b1c] uppercase">
                              Draft
                            </span>
                          ) : record.research.featured ? (
                            <span className="shrink-0 rounded-full bg-brand-red-50 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-brand-red uppercase">
                              Featured
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  ))}
                  {!visibleResearchRecords.length ? (
                    <p className="px-2 py-4 text-xs leading-5 text-[#9ba4b5]">
                      No initiatives yet. Start one with “New initiative”.
                    </p>
                  ) : null}
                </nav>
              </div>
            ) : section === "projects" ? (
              <div className="flex min-h-0 flex-col lg:h-full">
                <div className="shrink-0">
                  <div className="relative">
                    <MagnifyingGlass
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
                      size={17}
                    />
                    <input
                      className={`${inputClass} pl-9`}
                      onChange={(event) => setProjectQuery(event.target.value)}
                      placeholder="Find a project"
                      value={projectQuery}
                    />
                  </div>
                  <button
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-red/45 bg-brand-red/[0.04] text-sm font-semibold text-brand-red transition hover:bg-brand-red hover:text-white active:scale-[0.98]"
                    onClick={startNewProject}
                    type="button"
                  >
                    <Plus size={17} weight="bold" />
                    New project
                  </button>
                  <p className="mt-6 px-2 font-mono text-[10px] font-bold tracking-[0.16em] text-[#7e899d] uppercase dark:text-white/35">
                    Projects · {projectsReady ? projectRecords.length : "…"}
                  </p>
                </div>
                <nav className="mt-2 min-h-0 space-y-1 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                  {visibleProjectRecords.map((record) => (
                    <button
                      className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${record.slug === selectedProjectSlug && !showNewProject ? "bg-white shadow-[0_10px_24px_-20px_rgba(20,32,58,0.5)] dark:bg-white/10" : "hover:bg-white/70 dark:hover:bg-white/[0.05]"}`}
                      key={record.slug}
                      onClick={() => selectProject(record.slug)}
                      type="button"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {record.project.title || "Untitled project"}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-[#778299] dark:text-white/45">
                          <span className="truncate">
                            {record.project.startDate || record.project.status}
                          </span>
                          {record.project.draft ? (
                            <span className="shrink-0 rounded-full bg-brand-yellow-50 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-[#a97b1c] uppercase">
                              Draft
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  ))}
                  {!visibleProjectRecords.length ? (
                    <p className="px-2 py-4 text-xs leading-5 text-[#9ba4b5]">
                      No projects yet. Start one with “New project”.
                    </p>
                  ) : null}
                </nav>
              </div>
            ) : section === "members" ? (
              <div className="flex min-h-0 flex-col lg:h-full">
                <div className="shrink-0">
                  <div className="relative">
                    <MagnifyingGlass
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
                      size={17}
                    />
                    <input
                      className={`${inputClass} pl-9`}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Find a member"
                      value={query}
                    />
                  </div>
                  <button
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-blue/45 bg-brand-blue/[0.04] text-sm font-semibold text-brand-blue transition hover:bg-brand-blue hover:text-white active:scale-[0.98]"
                    onClick={startNew}
                    type="button"
                  >
                    <Plus size={17} weight="bold" />
                    New member
                  </button>
                  <p className="mt-6 px-2 font-mono text-[10px] font-bold tracking-[0.16em] text-[#7e899d] uppercase dark:text-white/35">
                    Directory · {ready ? members.length : "…"}
                  </p>
                </div>
                <nav className="mt-2 min-h-0 space-y-1 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                  {visibleMembers.map((member) => {
                    const record = records.find((item) => item.slug === member.slug);
                    const photoKey = record?.profile.photoKey;
                    return (
                      <button
                        className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${member.slug === selectedSlug && !showNew ? "bg-white shadow-[0_10px_24px_-20px_rgba(20,32,58,0.5)] dark:bg-white/10" : "hover:bg-white/70 dark:hover:bg-white/[0.05]"}`}
                        key={member.slug}
                        onClick={() => selectMember(member)}
                        type="button"
                      >
                        <span className="relative grid size-9 shrink-0 place-items-end overflow-hidden rounded-lg bg-[#e9edf5] dark:bg-white/10">
                          {photoKey ? (
                            // Native media avoids an image-component rehydration
                            // race for freshly uploaded, private CMS assets.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt=""
                              className="size-full object-contain object-bottom"
                              key={photoKey}
                              src={`/api/member-cms/media/${photoKey}`}
                            />
                          ) : (
                            <span className="pb-2 text-xs font-semibold text-[#778299]">
                              {member.name
                                .split(" ")
                                .map((part) => part[0])
                                .slice(0, 2)
                                .join("")}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 truncate text-sm font-semibold">
                            {member.name}
                            {member.highlighted ? (
                              <Star
                                aria-label="Highlighted"
                                className="shrink-0 text-brand-yellow"
                                size={12}
                                weight="fill"
                              />
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-[#778299] dark:text-white/45">
                            {member.division}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            ) : section === "administration" ? (
              <div className="rounded-2xl border border-[#dfe4ee] bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.025]">
                <span
                  className={`grid size-9 place-items-center rounded-xl bg-white ${activeWorkspace.tone} dark:bg-white/10`}
                >
                  <WorkspaceIcon section={section} size={20} />
                </span>
                <p className="mt-4 font-display text-lg font-semibold tracking-[-0.035em]">
                  {activeWorkspace.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-[#778299] dark:text-white/45">
                  Administrator accounts, passphrases, and per-page permissions.
                </p>
              </div>
            ) : section === "contact" ? ( // NOSONAR: won't-fix, see docs/repo-history.md
              <div className="rounded-2xl border border-[#dfe4ee] bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.025]">
                <span className="grid size-9 place-items-center rounded-xl bg-white text-brand-green dark:bg-white/10">
                  <Envelope size={20} weight="duotone" />
                </span>
                <p className="mt-4 font-display text-lg font-semibold tracking-[-0.035em]">
                  Contact Settings
                </p>
                <p className="mt-1 text-sm leading-6 text-[#778299] dark:text-white/45">
                  A single record — the recipient inbox, HQ address, and map coordinates shown on
                  the public contact page.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-[#dfe4ee] bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.025]">
                <span
                  className={`grid size-9 place-items-center rounded-xl bg-white ${activeWorkspace.tone} dark:bg-white/10`}
                >
                  <WorkspaceIcon section={section} size={20} />
                </span>
                <p className="mt-4 font-display text-lg font-semibold tracking-[-0.035em]">
                  {activeWorkspace.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-[#778299] dark:text-white/45">
                  Collection-specific controls will live here as this workspace becomes available.
                </p>
              </div>
            )}
          </aside>

          <section className="admin-editor-enter min-w-0 p-5 sm:p-8 lg:p-10">
            <div className="mx-auto max-w-5xl">
              {section === "members" ? (
                <>
                  <div className="mt-6 flex gap-1 overflow-x-auto border-b border-[#dee4ef] dark:border-white/10">
                    {TABS.map((tab) => (
                      <button
                        className={`relative whitespace-nowrap px-4 py-3 text-sm font-semibold transition ${activeTab === tab.id ? "text-brand-blue" : "text-[#758097] hover:text-[#202532] dark:text-white/45 dark:hover:text-white"}`}
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        type="button"
                      >
                        {tab.label}
                        {activeTab === tab.id ? (
                          <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-blue" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <MemberEditor
                    key={
                      showNew
                        ? `new-${newKey}`
                        : `${currentMember.slug}-${selectedRecord?.updatedAt ?? "base"}`
                    }
                    activeTab={activeTab}
                    initialMember={showNew ? undefined : currentMember}
                    initialProfile={showNew ? undefined : selectedRecord?.profile}
                    onDeleted={(slug) => {
                      setRecords((current) => current.filter((item) => item.slug !== slug));
                      setSelectedSlug(undefined);
                      setHasUnsavedChanges(false);
                    }}
                    onDirtyChange={setHasUnsavedChanges}
                    sourceMemberSlug={
                      showNew ? undefined : (selectedRecord?.sourceSlug ?? currentMember.slug)
                    }
                    sourceRecordSlug={
                      showNew ? undefined : (selectedRecord?.slug ?? currentMember.slug)
                    }
                    onSaved={(record) => {
                      setRecords((current) => [
                        ...current.filter(
                          (item) => item.slug !== record.slug && item.slug !== record.sourceSlug,
                        ),
                        record,
                      ]);
                      setSelectedSlug(record.slug);
                      setShowNew(false);
                      setHasUnsavedChanges(false);
                    }}
                  />
                </>
              ) : section === "publications" ? (
                <PublicationEditor
                  key={
                    showNewPublication
                      ? `new-${publicationNewKey}`
                      : `${selectedPublication?.slug ?? "none"}-${selectedPublication?.updatedAt ?? "base"}`
                  }
                  initialRecord={showNewPublication ? undefined : selectedPublication}
                  members={members}
                  paperLimitBytes={paperLimitBytes}
                  onDeleted={(slug) => {
                    setPublicationRecords((current) =>
                      current.filter((record) => record.slug !== slug),
                    );
                    setSelectedPublicationSlug(undefined);
                    setHasUnsavedChanges(false);
                  }}
                  onDirtyChange={setHasUnsavedChanges}
                  onSaved={(record) => {
                    setPublicationRecords((current) => [
                      ...current.filter((item) => item.slug !== record.slug),
                      record,
                    ]);
                    setSelectedPublicationSlug(record.slug);
                    setShowNewPublication(false);
                    setHasUnsavedChanges(false);
                  }}
                />
              ) : section === "articles" ? (
                <ArticleEditor
                  key={
                    showNewArticle
                      ? `new-${articleNewKey}`
                      : `${selectedArticle?.slug ?? "none"}-${selectedArticle?.updatedAt ?? "base"}`
                  }
                  initialRecord={showNewArticle ? undefined : selectedArticle}
                  members={members}
                  onDeleted={(slug) => {
                    setArticleRecords((current) =>
                      current.filter((record) => record.slug !== slug),
                    );
                    setSelectedArticleSlug(undefined);
                    setHasUnsavedChanges(false);
                  }}
                  onDirtyChange={setHasUnsavedChanges}
                  onSaved={(record) => {
                    setArticleRecords((current) => [
                      ...current.filter((item) => item.slug !== record.slug),
                      record,
                    ]);
                    setSelectedArticleSlug(record.slug);
                    setShowNewArticle(false);
                    setHasUnsavedChanges(false);
                  }}
                />
              ) : section === "research" ? (
                <ResearchEditor
                  key={
                    showNewResearch
                      ? `new-${researchNewKey}`
                      : `${selectedResearch?.slug ?? "none"}-${selectedResearch?.updatedAt ?? "base"}`
                  }
                  initialRecord={showNewResearch ? undefined : selectedResearch}
                  members={members}
                  onDeleted={(slug) => {
                    setResearchRecords((current) =>
                      current.filter((record) => record.slug !== slug),
                    );
                    setSelectedResearchSlug(undefined);
                    setHasUnsavedChanges(false);
                  }}
                  onDirtyChange={setHasUnsavedChanges}
                  onSaved={(record) => {
                    setResearchRecords((current) => [
                      ...current.filter((item) => item.slug !== record.slug),
                      record,
                    ]);
                    setSelectedResearchSlug(record.slug);
                    setShowNewResearch(false);
                    setHasUnsavedChanges(false);
                  }}
                />
              ) : section === "projects" ? (
                <ProjectEditor
                  key={
                    showNewProject
                      ? `new-${projectNewKey}`
                      : `${selectedProject?.slug ?? "none"}-${selectedProject?.updatedAt ?? "base"}`
                  }
                  initialRecord={showNewProject ? undefined : selectedProject}
                  members={members}
                  videoLimitBytes={videoLimitBytes}
                  onDeleted={(slug) => {
                    setProjectRecords((current) =>
                      current.filter((record) => record.slug !== slug),
                    );
                    setSelectedProjectSlug(undefined);
                    setHasUnsavedChanges(false);
                  }}
                  onDirtyChange={setHasUnsavedChanges}
                  onSaved={(record) => {
                    setProjectRecords((current) => [
                      ...current.filter((item) => item.slug !== record.slug),
                      record,
                    ]);
                    setSelectedProjectSlug(record.slug);
                    setShowNewProject(false);
                    setHasUnsavedChanges(false);
                  }}
                />
              ) : section === "administration" ? (
                <AdminManagementPanel initialAdmins={initialAdmins} />
              ) : section === "contact" ? ( // NOSONAR: won't-fix, see docs/repo-history.md
                <ContactSettingsEditor
                  isSuperadmin={viewer.role === "superadmin"}
                  onDirtyChange={setHasUnsavedChanges}
                />
              ) : (
                <EditorialOverview
                  canAccess={canAccess}
                  section={section}
                  onChoose={(nextSection) => changeSection(nextSection)}
                />
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function DeniedScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="admin-editor-enter mx-auto grid min-h-[calc(100dvh-69px)] w-full max-w-[1680px] place-items-center px-5 py-16">
      <div className="w-full max-w-md rounded-2xl border border-[#dfe4ee] bg-white p-8 text-center shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-red-50 text-brand-red">
          <Lock size={24} weight="duotone" />
        </div>
        <h2 className="mt-5 font-display text-2xl font-semibold tracking-[-0.03em]">
          You don&apos;t have permission
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#68758a] dark:text-white/55">
          Please ask your administrator to grant access to this workspace.
        </p>
        <button
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#171b25] px-5 text-sm font-semibold text-white shadow-[0_18px_35px_-16px_rgba(20,32,58,0.55)] transition hover:bg-brand-blue active:scale-[0.98]"
          onClick={onBack}
          type="button"
        >
          Back to overview
        </button>
      </div>
    </div>
  );
}

function EditorialOverview({
  canAccess,
  onChoose,
  section,
}: {
  canAccess: (section: EditorialSection) => boolean;
  onChoose: (section: EditorialSection) => void;
  section: EditorialSection;
}) {
  const label =
    section === "overview"
      ? "Editorial CMS"
      : EDITORIAL_SECTIONS.find((item) => item.id === section)?.label;
  return (
    <div className="pt-14">
      <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-blue uppercase">
        {section === "overview" ? "MGM Laboratory" : "Collection"}
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        {label}
      </h1>
      {section === "members" ? null : (
        <p className="mt-5 max-w-xl text-base leading-7 text-[#6b768b] dark:text-white/55">
          {section === "overview"
            ? "Choose a collection with the workspace switcher above. Member profiles, Articles, Publications, Research, Careers, and Contact Settings are ready to edit; the remaining editorial collections are intentionally reserved for their dedicated publishing workflows."
            : `${label} is reserved for its own editorial workflow. It will be added here without changing the member, article, or publication workspaces.`}
        </p>
      )}
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {EDITORIAL_SECTIONS.filter((item) => canAccess(item.id)).map((item) => {
          const available = LIVE_WORKSPACES.has(item.id);
          return (
            <button
              className={`rounded-2xl border p-5 text-left transition ${available ? "border-brand-blue/30 bg-brand-blue/[0.04] hover:border-brand-blue hover:bg-brand-blue/[0.08]" : "border-[#dfe4ee] bg-white/55 opacity-60 dark:border-white/10 dark:bg-white/[0.025]"}`}
              disabled={!available}
              key={item.id}
              onClick={() => onChoose(item.id)}
              type="button"
            >
              <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-brand-blue uppercase">
                {available ? "Available" : "Reserved"}
              </span>
              <span className="mt-2 block font-display text-xl font-semibold tracking-[-0.03em]">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MemberEditor({
  activeTab,
  initialMember,
  initialProfile,
  onDeleted,
  onDirtyChange,
  onSaved,
  sourceMemberSlug,
  sourceRecordSlug,
}: {
  activeTab: EditorTab;
  initialMember?: Member;
  initialProfile?: CmsMemberProfile;
  onDeleted: (slug: string) => void;
  onDirtyChange: (isDirty: boolean) => void;
  onSaved: (record: CmsMemberRecord) => void;
  sourceMemberSlug?: string;
  sourceRecordSlug?: string;
}) {
  const [draft, setDraft] = useState<MemberDraft>(() =>
    initialMember
      ? memberToDraft(initialMember)
      : {
          accent: "blue",
          bio: "",
          division: "Website",
          group: "Research and Development",
          hasPortrait: false,
          highlighted: false,
          labFocus: [],
          name: "",
          nickname: "",
          role: "Student Member",
          slug: `member-${Date.now()}`,
          unit: "",
        },
  );
  const [profile, setProfile] = useState<CmsMemberProfile>(() => copyProfile(initialProfile));
  const [photoSource, setPhotoSource] = useState<string | undefined>(() =>
    initialProfile?.photoKey ? `/api/member-cms/media/${initialProfile.photoKey}` : undefined,
  );
  const [photoUpload, setPhotoUpload] = useState<string>();
  const [photoToEdit, setPhotoToEdit] = useState<string>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [originalRecordSlug] = useState(sourceRecordSlug);
  const fileInput = useRef<HTMLInputElement>(null);
  const [baseline, setBaseline] = useState(() => JSON.stringify({ draft, profile }));
  const signature = JSON.stringify({ draft, profile });
  const isDirty = Boolean(photoUpload) || baseline !== signature;
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);
  const mutateProfile = (update: (current: CmsMemberProfile) => CmsMemberProfile) => {
    if (status === "saved") setStatus("idle");
    setProfile((current) => update(copyProfile(current)));
  };
  const updateDraft = <K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) => {
    if (status === "saved") setStatus("idle");
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const openPhotoEditor = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoToEdit(String(reader.result));
    };
    reader.readAsDataURL(file);
  };
  const useEditedPhoto = (portrait: string) => {
    setPhotoSource(portrait);
    setPhotoUpload(portrait);
    setPhotoToEdit(undefined);
    setDraft((current) => ({ ...current, hasPortrait: true }));
    mutateProfile((current) => ({ ...current, photoPosition: { x: 50, y: 50, zoom: 1 } }));
  };
  const save = async () => {
    if (!draft.name.trim() || !draft.slug.trim()) {
      toast.error("Name and profile URL are required.");
      return;
    }
    setStatus("saving");
    setError(undefined);
    try {
      let nextProfile = copyProfile(profile);
      if (photoUpload) {
        const photoResponse = await fetch(
          `/api/admin/members/${encodeURIComponent(draft.slug)}/photo`,
          {
            body: JSON.stringify({ image: photoUpload }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
        );
        if (!photoResponse.ok)
          throw new Error(await responseError(photoResponse, "Portrait upload failed."));
        const photo = (await photoResponse.json()) as { key: string };
        nextProfile = { ...nextProfile, photoKey: photo.key };
      }
      const member = draftToMember(draft);
      const response = await fetch(
        `/api/admin/members/${encodeURIComponent(originalRecordSlug ?? member.slug)}`,
        {
          body: JSON.stringify({ member, profile: nextProfile, sourceSlug: sourceMemberSlug }),
          headers: { "content-type": "application/json" },
          method: "PUT",
        },
      );
      if (!response.ok) throw new Error(await responseError(response, "Profile save failed."));
      const savedRecord = (await response.json()) as CmsMemberRecord;
      const savedDraft = memberToDraft(savedRecord.member);
      const savedProfile = copyProfile(savedRecord.profile);
      setDraft(savedDraft);
      setProfile(savedProfile);
      setPhotoSource(
        savedProfile.photoKey ? `/api/member-cms/media/${savedProfile.photoKey}` : undefined,
      );
      setBaseline(JSON.stringify({ draft: savedDraft, profile: savedProfile }));
      onSaved(savedRecord);
      window.dispatchEvent(new CustomEvent("mgm:member-updated", { detail: savedRecord }));
      const channel = new BroadcastChannel("mgm-member-cms");
      channel.postMessage({ record: savedRecord, type: "member-updated" });
      channel.close();
      setPhotoUpload(undefined);
      onDirtyChange(false);
      setStatus("saved");
      toast.success("Changes published", {
        description: `${member.name} is updated on the public member profile.`,
      });
    } catch (saveError) {
      setStatus("error");
      const message =
        saveError instanceof Error ? saveError.message : "The changes could not be saved.";
      setError(message);
      toast.error("Changes were not saved", { description: message });
    }
  };
  const remove = async () => {
    if (!originalRecordSlug) return;
    if (!window.confirm(`Delete “${draft.name || originalRecordSlug}” permanently?`)) return;
    try {
      const response = await fetch(`/api/admin/members/${encodeURIComponent(originalRecordSlug)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await responseError(response, "Delete failed."));
      onDeleted(originalRecordSlug);
      toast.success("Member deleted");
    } catch (deleteError) {
      toast.error("Member was not deleted", {
        description: deleteError instanceof Error ? deleteError.message : undefined,
      });
    }
  };
  return (
    <div>
      <div className="mt-10 flex flex-wrap items-start justify-between gap-5 border-b border-[#dee4ef] pb-7 dark:border-white/10">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-blue uppercase">
            {initialMember ? "Member record" : "New record"}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            {draft.name || "Untitled member"}
          </h1>
          <p className="mt-2 text-sm text-[#69748a] dark:text-white/50">
            Structured fields publish directly to the member profile.
          </p>
        </div>
        {initialMember ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[#5d687d] transition hover:bg-white hover:text-brand-blue dark:text-white/60 dark:hover:bg-white/10"
              href={`/member/${initialMember.slug}`}
              target="_blank"
            >
              <ArrowSquareOut size={15} />
              View profile
            </Link>
            <button
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[#5d687d] transition hover:bg-brand-red-50 hover:text-brand-red dark:text-white/60 dark:hover:bg-brand-red/15"
              onClick={() => void remove()}
              type="button"
            >
              <Trash size={15} />
              Delete
            </button>
          </div>
        ) : null}
      </div>
      <div className="sticky top-[7.5rem] z-30 mt-5 flex justify-end pointer-events-none">
        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          {isDirty ? (
            <span className="rounded-full bg-[#171b25]/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              Unsaved changes
            </span>
          ) : null}
          <button
            aria-label="Save member changes"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#171b25] px-5 text-sm font-semibold text-white shadow-[0_18px_35px_-16px_rgba(20,32,58,0.55)] transition hover:bg-brand-blue active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            disabled={status === "saving"}
            onClick={save}
            type="button"
          >
            {status === "saved" ? (
              <Check size={18} weight="bold" />
            ) : (
              <FloppyDisk size={18} weight="bold" />
            )}
            {status === "saving"
              ? "Saving…"
              : status === "saved" && !isDirty
                ? "Saved"
                : "Save changes"}
          </button>
        </div>
      </div>
      {status === "error" ? (
        <p className="mt-4 rounded-xl bg-brand-red-50 px-4 py-3 text-sm text-brand-red dark:bg-brand-red/15 dark:text-brand-red-100">
          {error ?? "The changes could not be saved."}
        </p>
      ) : null}
      {activeTab === "profile" ? (
        <ProfileTab
          draft={draft}
          fileInput={fileInput}
          onPhoto={openPhotoEditor}
          onProfile={mutateProfile}
          photoSource={photoSource}
          profile={profile}
          updateDraft={updateDraft}
        />
      ) : null}
      {activeTab === "experience" ? (
        <ExperienceTab onProfile={mutateProfile} profile={profile} />
      ) : null}
      {activeTab === "education" ? (
        <EducationTab onProfile={mutateProfile} profile={profile} />
      ) : null}
      {activeTab === "credentials" ? (
        <CredentialsTab onProfile={mutateProfile} profile={profile} />
      ) : null}
      {photoToEdit ? (
        <PhotoEditorDialog
          image={photoToEdit}
          onClose={() => setPhotoToEdit(undefined)}
          onConfirm={useEditedPhoto}
        />
      ) : null}
    </div>
  );
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string; message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(" ") : body.message;
    return message || body.error || fallback;
  } catch {
    return fallback;
  }
}

function ProfileTab({
  draft,
  fileInput,
  onPhoto,
  onProfile,
  photoSource,
  profile,
  updateDraft,
}: {
  draft: MemberDraft;
  fileInput: React.RefObject<HTMLInputElement | null>;
  onPhoto: (file?: File) => void;
  onProfile: (update: (profile: CmsMemberProfile) => CmsMemberProfile) => void;
  photoSource?: string;
  profile: CmsMemberProfile;
  updateDraft: <K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) => void;
}) {
  return (
    <div className="mt-7 space-y-10">
      <div className="grid gap-7 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <div>
          <CropPreview profile={profile} source={photoSource} />
          <input
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              onPhoto(event.target.files?.[0]);
              event.target.value = "";
            }}
            ref={fileInput}
            type="file"
          />
          <button
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#dce2ee] py-2 text-sm font-semibold transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10"
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            <Camera size={17} />
            Replace photo
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input
              className={inputClass}
              onChange={(e) => updateDraft("name", e.target.value)}
              value={draft.name}
            />
          </Field>
          <Field label="Display name">
            <input
              className={inputClass}
              onChange={(e) => updateDraft("nickname", e.target.value)}
              value={draft.nickname}
            />
          </Field>
          <Field label="Division">
            <select
              className={inputClass}
              onChange={(e) => updateDraft("division", e.target.value as MemberDraft["division"])}
              value={draft.division}
            >
              {MEMBER_DIVISIONS.map((division) => (
                <option key={division}>{division}</option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select
              className={inputClass}
              onChange={(e) => updateDraft("role", e.target.value as MemberDraft["role"])}
              value={draft.role}
            >
              <option>Student Member</option>
              <option>Professor</option>
            </select>
          </Field>
          <Field label="Profile URL slug">
            <input
              className={inputClass}
              onChange={(e) =>
                updateDraft("slug", e.target.value.toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-"))
              }
              value={draft.slug}
            />
          </Field>
          <Field label="Accent">
            <select
              className={inputClass}
              onChange={(e) => updateDraft("accent", e.target.value as MemberDraft["accent"])}
              value={draft.accent}
            >
              <option value="blue">Blue</option>
              <option value="green">Green</option>
              <option value="yellow">Yellow</option>
              <option value="red">Red</option>
            </select>
          </Field>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Star
              size={15}
              weight={draft.highlighted ? "fill" : "regular"}
              className="text-brand-yellow"
            />
            Highlighted (Coordinator)
          </p>
          <p className="mt-0.5 text-xs leading-5 text-[#8490a5] dark:text-white/40">
            Pins this member to the front of their division, and of “All”, on the public directory
            with a “Coordinator” badge. Multiple members per division can be highlighted.
          </p>
        </div>
        <button
          aria-checked={draft.highlighted}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${draft.highlighted ? "bg-brand-yellow" : "bg-[#c6cedd] dark:bg-white/15"}`}
          onClick={() => updateDraft("highlighted", !draft.highlighted)}
          role="switch"
          type="button"
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${draft.highlighted ? "left-[1.375rem]" : "left-0.5"}`}
          />
        </button>
      </div>
      <div>
        <Field label="Bio">
          <textarea
            className={textareaClass}
            onChange={(e) => onProfile((current) => ({ ...current, bio: e.target.value }))}
            placeholder="A concise introduction to this member."
            value={profile.bio ?? draft.bio}
          />
        </Field>
      </div>
      <TagEditor
        label="Preferred stack"
        onChange={(skills) => onProfile((current) => ({ ...current, skills }))}
        placeholder="Add a technology, for example: TypeScript"
        values={profile.skills ?? draft.labFocus}
      />
      <TagEditor
        label="Projects"
        onChange={(projects) => onProfile((current) => ({ ...current, projects }))}
        placeholder="Add a notable project"
        values={profile.projects ?? []}
      />
      <LinkEditor
        onChange={(links) => onProfile((current) => ({ ...current, links }))}
        values={profile.links ?? []}
      />
    </div>
  );
}

function TagEditor({
  label,
  onChange,
  placeholder,
  values,
}: {
  label: string;
  onChange: (values: string[]) => void;
  placeholder: string;
  values: string[];
}) {
  const [value, setValue] = useState("");
  return (
    <div>
      <span className="mb-2 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
        {label}
      </span>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#d9dfeb] bg-white p-3 dark:border-white/10 dark:bg-white/[0.045]">
        {values.map((skill, index) => (
          <span
            className="inline-flex items-center gap-1 rounded-lg bg-brand-blue-50 px-2.5 py-1.5 text-sm text-brand-blue dark:bg-brand-blue/20 dark:text-brand-blue-100"
            key={`${skill}-${index}`}
          >
            {skill}
            <button
              aria-label={`Remove ${skill}`}
              className="ml-0.5 opacity-60 hover:opacity-100"
              onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
              type="button"
            >
              <X size={14} weight="bold" />
            </button>
          </span>
        ))}
        <input
          className="min-w-44 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-[#9ba4b5] dark:placeholder:text-white/25"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              e.preventDefault();
              onChange([...values, value.trim()]);
              setValue("");
            }
          }}
          placeholder={placeholder}
          value={value}
        />
      </div>
      <p className="mt-2 text-xs text-[#7b8599] dark:text-white/40">Press Enter to add a skill.</p>
    </div>
  );
}

function LinkEditor({
  onChange,
  values,
}: {
  onChange: (values: CmsLink[]) => void;
  values: CmsLink[];
}) {
  const update = (index: number, key: keyof CmsLink, value: string) =>
    onChange(
      values.map((link, itemIndex) => (itemIndex === index ? { ...link, [key]: value } : link)),
    );
  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">External links</p>
          <p className="mt-1 text-sm text-[#778299] dark:text-white/45">
            Website, GitHub, LinkedIn, portfolio, and other destinations.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-blue hover:bg-brand-blue-50 dark:hover:bg-brand-blue/15"
          onClick={() => onChange([...values, { label: "", url: "" }])}
          type="button"
        >
          <Plus size={16} />
          Add
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {values.map((link, index) => (
          <EditRow
            key={index}
            onRemove={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
          >
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <Field label="Label">
                <input
                  className={inputClass}
                  onChange={(e) => update(index, "label", e.target.value)}
                  placeholder="GitHub"
                  value={link.label}
                />
              </Field>
              <Field label="URL">
                <input
                  className={inputClass}
                  onChange={(e) => update(index, "url", e.target.value)}
                  placeholder="https://"
                  type="url"
                  value={link.url}
                />
              </Field>
            </div>
          </EditRow>
        ))}
      </div>
    </section>
  );
}

function ExperienceTab({
  onProfile,
  profile,
}: {
  onProfile: (update: (profile: CmsMemberProfile) => CmsMemberProfile) => void;
  profile: CmsMemberProfile;
}) {
  const values = profile.experience ?? [];
  const update = (index: number, patch: Partial<CmsExperience>) =>
    onProfile((current) => ({
      ...current,
      experience: (current.experience ?? []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  return (
    <section className="mt-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.04em]">Experience</h2>
          <p className="mt-1 text-sm text-[#778299] dark:text-white/45">
            Each role is displayed in the LinkedIn-style company timeline.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-1 rounded-xl bg-brand-blue px-3 py-2 text-sm font-semibold text-white transition active:scale-[0.98]"
          onClick={() =>
            onProfile((current) => ({
              ...current,
              experience: [...(current.experience ?? []), { company: "", title: "" }],
            }))
          }
          type="button"
        >
          <Plus size={16} weight="bold" />
          Add role
        </button>
      </div>
      <div className="mt-5 space-y-4">
        {values.map((item, index) => (
          <EditRow
            key={index}
            onRemove={() =>
              onProfile((current) => ({
                ...current,
                experience: (current.experience ?? []).filter(
                  (_, itemIndex) => itemIndex !== index,
                ),
              }))
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company or organization">
                <input
                  className={inputClass}
                  onChange={(e) => update(index, { company: e.target.value })}
                  value={item.company}
                />
              </Field>
              <Field label="Position">
                <input
                  className={inputClass}
                  onChange={(e) => update(index, { title: e.target.value })}
                  value={item.title}
                />
              </Field>
              <Field label="Start">
                <input
                  className={inputClass}
                  onChange={(e) => update(index, { start: fromDate(e.target.value) })}
                  type="month"
                  value={asDate(item.start)}
                />
              </Field>
              <Field label="End">
                <input
                  className={inputClass}
                  disabled={item.current}
                  onChange={(e) => update(index, { end: fromDate(e.target.value) })}
                  type="month"
                  value={asDate(item.end)}
                />
              </Field>
              <Field label="Location">
                <input
                  className={inputClass}
                  onChange={(e) => update(index, { location: e.target.value })}
                  value={item.location ?? ""}
                />
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm font-medium">
                <input
                  checked={Boolean(item.current)}
                  className="size-4 accent-brand-blue"
                  onChange={(e) =>
                    update(index, {
                      current: e.target.checked,
                      end: e.target.checked ? undefined : item.end,
                    })
                  }
                  type="checkbox"
                />
                I currently work here
              </label>
            </div>
            <Field label="Description">
              <textarea
                className={`${textareaClass} mt-3 min-h-20`}
                onChange={(e) => update(index, { description: e.target.value })}
                value={item.description ?? ""}
              />
            </Field>
          </EditRow>
        ))}
      </div>
      {!values.length ? (
        <EmptyEditor copy="Add the first role to build a professional timeline." />
      ) : null}
    </section>
  );
}

function EducationTab({
  onProfile,
  profile,
}: {
  onProfile: (update: (profile: CmsMemberProfile) => CmsMemberProfile) => void;
  profile: CmsMemberProfile;
}) {
  const values = profile.education ?? [];
  const update = (index: number, patch: Partial<CmsEducation>) =>
    onProfile((current) => ({
      ...current,
      education: (current.education ?? []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  return (
    <section className="mt-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.04em]">Education</h2>
          <p className="mt-1 text-sm text-[#778299] dark:text-white/45">
            Education is shown with institution, study path, and dates.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-1 rounded-xl bg-brand-blue px-3 py-2 text-sm font-semibold text-white"
          onClick={() =>
            onProfile((current) => ({
              ...current,
              education: [...(current.education ?? []), { institution: "" }],
            }))
          }
          type="button"
        >
          <Plus size={16} weight="bold" />
          Add education
        </button>
      </div>
      <div className="mt-5 space-y-4">
        {values.map((item, index) => (
          <EditRow
            key={index}
            onRemove={() =>
              onProfile((current) => ({
                ...current,
                education: (current.education ?? []).filter((_, itemIndex) => itemIndex !== index),
              }))
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Institution">
                <input
                  className={inputClass}
                  onChange={(e) => update(index, { institution: e.target.value })}
                  value={item.institution}
                />
              </Field>
              <Field label="Degree or field">
                <input
                  className={inputClass}
                  onChange={(e) => update(index, { degree: e.target.value })}
                  value={item.degree ?? ""}
                />
              </Field>
              <Field label="Start">
                <input
                  className={inputClass}
                  onChange={(e) => update(index, { start: fromDate(e.target.value) })}
                  type="month"
                  value={asDate(item.start)}
                />
              </Field>
              <Field label="End">
                <input
                  className={inputClass}
                  onChange={(e) => update(index, { end: fromDate(e.target.value) })}
                  type="month"
                  value={asDate(item.end)}
                />
              </Field>
            </div>
            <Field label="Activities and detail">
              <textarea
                className={`${textareaClass} mt-3 min-h-20`}
                onChange={(e) => update(index, { detail: e.target.value })}
                value={item.detail ?? ""}
              />
            </Field>
          </EditRow>
        ))}
      </div>
      {!values.length ? <EmptyEditor copy="Add academic history, bootcamps, or courses." /> : null}
    </section>
  );
}

function CredentialsTab({
  onProfile,
  profile,
}: {
  onProfile: (update: (profile: CmsMemberProfile) => CmsMemberProfile) => void;
  profile: CmsMemberProfile;
}) {
  const languages = profile.languages ?? [];
  const achievements = profile.achievements ?? [];
  const certificates = profile.certificates ?? [];
  const update = <T,>(
    key: "languages" | "achievements" | "certificates",
    index: number,
    patch: Partial<T>,
  ) =>
    onProfile((current) => ({
      ...current,
      [key]: ((current[key] ?? []) as T[]).map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  return (
    <div className="mt-7 space-y-10">
      <SimpleCollection<CmsLanguage>
        label="Languages"
        empty="Add spoken languages and proficiency."
        onAdd={() =>
          onProfile((current) => ({
            ...current,
            languages: [...(current.languages ?? []), { name: "" }],
          }))
        }
        onRemove={(index) =>
          onProfile((current) => ({
            ...current,
            languages: (current.languages ?? []).filter((_, itemIndex) => itemIndex !== index),
          }))
        }
        values={languages}
      >
        {(item, index) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Language">
              <input
                className={inputClass}
                onChange={(e) => update<CmsLanguage>("languages", index, { name: e.target.value })}
                value={item.name}
              />
            </Field>
            <Field label="Proficiency">
              <input
                className={inputClass}
                onChange={(e) =>
                  update<CmsLanguage>("languages", index, { proficiency: e.target.value })
                }
                placeholder="Professional working"
                value={item.proficiency ?? ""}
              />
            </Field>
          </div>
        )}
      </SimpleCollection>
      <SimpleCollection<CmsAchievement>
        label="Achievements"
        empty="Add awards, competitions, and recognition."
        onAdd={() =>
          onProfile((current) => ({
            ...current,
            achievements: [...(current.achievements ?? []), { title: "" }],
          }))
        }
        onRemove={(index) =>
          onProfile((current) => ({
            ...current,
            achievements: (current.achievements ?? []).filter(
              (_, itemIndex) => itemIndex !== index,
            ),
          }))
        }
        values={achievements}
      >
        {(item, index) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title">
                <input
                  className={inputClass}
                  onChange={(e) =>
                    update<CmsAchievement>("achievements", index, { title: e.target.value })
                  }
                  value={item.title}
                />
              </Field>
              <Field label="Issuer">
                <input
                  className={inputClass}
                  onChange={(e) =>
                    update<CmsAchievement>("achievements", index, { issuer: e.target.value })
                  }
                  value={item.issuer ?? ""}
                />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                className={`${textareaClass} mt-3 min-h-20`}
                onChange={(e) =>
                  update<CmsAchievement>("achievements", index, { description: e.target.value })
                }
                value={item.description ?? ""}
              />
            </Field>
          </>
        )}
      </SimpleCollection>
      <SimpleCollection<CmsCertificate>
        label="Certificates"
        empty="Add certifications and credential links."
        onAdd={() =>
          onProfile((current) => ({
            ...current,
            certificates: [...(current.certificates ?? []), { title: "" }],
          }))
        }
        onRemove={(index) =>
          onProfile((current) => ({
            ...current,
            certificates: (current.certificates ?? []).filter(
              (_, itemIndex) => itemIndex !== index,
            ),
          }))
        }
        values={certificates}
      >
        {(item, index) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Certificate">
              <input
                className={inputClass}
                onChange={(e) =>
                  update<CmsCertificate>("certificates", index, { title: e.target.value })
                }
                value={item.title}
              />
            </Field>
            <Field label="Issuer">
              <input
                className={inputClass}
                onChange={(e) =>
                  update<CmsCertificate>("certificates", index, { issuer: e.target.value })
                }
                value={item.issuer ?? ""}
              />
            </Field>
            <Field label="Credential URL">
              <input
                className={inputClass}
                onChange={(e) =>
                  update<CmsCertificate>("certificates", index, { credentialUrl: e.target.value })
                }
                type="url"
                value={item.credentialUrl ?? ""}
              />
            </Field>
            <Field label="Credential ID">
              <input
                className={inputClass}
                onChange={(e) =>
                  update<CmsCertificate>("certificates", index, { credentialId: e.target.value })
                }
                value={item.credentialId ?? ""}
              />
            </Field>
          </div>
        )}
      </SimpleCollection>
    </div>
  );
}

function SimpleCollection<T extends object>({
  children,
  empty,
  label,
  onAdd,
  onRemove,
  values,
}: {
  children: (item: T, index: number) => React.ReactNode;
  empty: string;
  label: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  values: T[];
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.04em]">{label}</h2>
        </div>
        <button
          className="inline-flex items-center gap-1 rounded-xl bg-brand-blue px-3 py-2 text-sm font-semibold text-white"
          onClick={onAdd}
          type="button"
        >
          <Plus size={16} weight="bold" />
          Add
        </button>
      </div>
      <div className="mt-5 space-y-4">
        {values.map((item, index) => (
          <EditRow key={index} onRemove={() => onRemove(index)}>
            {children(item, index)}
          </EditRow>
        ))}
      </div>
      {!values.length ? <EmptyEditor copy={empty} /> : null}
    </section>
  );
}
function EmptyEditor({ copy }: { copy: string }) {
  return (
    <div className="mt-5 grid min-h-32 place-items-center rounded-2xl border border-dashed border-[#ccd4e2] p-6 text-center text-sm text-[#7c879b] dark:border-white/15 dark:text-white/40">
      {copy}
    </div>
  );
}
