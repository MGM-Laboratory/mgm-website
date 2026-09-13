"use client";

import {
  ArrowSquareOut,
  Camera,
  Check,
  FloppyDisk,
  ImageSquare,
  MagnifyingGlass,
  Plus,
  SignOut,
  Trash,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { MEMBER_DIVISIONS, MEMBERS, type Member } from "@/data/members";
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

type EditorTab = "profile" | "experience" | "education" | "credentials";
type EditorialSection =
  "overview" | "articles" | "projects" | "publications" | "research" | "members" | "careers";
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
];

const emptyProfile = (): CmsMemberProfile => ({
  achievements: [],
  certificates: [],
  education: [],
  experience: [],
  languages: [],
  links: [],
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

export function MemberCmsStudio() {
  const { members, ready, records, setRecords } = useMemberRecords();
  const [section, setSection] = useState<EditorialSection>("overview");
  const [activeTab, setActiveTab] = useState<EditorTab>("profile");
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const [showNew, setShowNew] = useState(false);
  const [newKey, setNewKey] = useState(0);

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

  const selectMember = (member: Member) => {
    setShowNew(false);
    setSelectedSlug(member.slug);
  };

  const startNew = () => {
    setSelectedSlug(undefined);
    setShowNew(true);
    setNewKey((current) => current + 1);
    setActiveTab("profile");
  };
  const currentMember = selected ?? members[0] ?? MEMBERS[0];

  return (
    <main className="admin-shell min-h-[100dvh] bg-[#f5f7fb] text-[#171b25] dark:bg-[#0f1117] dark:text-white">
      <header className="sticky top-0 z-40 border-b border-[#dee4ef] bg-[#f5f7fb]/95 px-5 py-3 backdrop-blur dark:border-white/10 dark:bg-[#0f1117]/95 sm:px-7">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-blue text-white">
              <UsersThree size={21} weight="duotone" />
            </span>
            <div>
              <p className="font-display text-lg font-semibold tracking-[-0.04em]">
                Editorial workspace
              </p>
              <p className="font-mono text-[10px] tracking-[0.13em] text-[#768096] uppercase dark:text-white/40">
                MGM Laboratory CMS
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              className="hidden rounded-lg px-3 py-2 text-sm text-[#5d687d] transition hover:bg-white hover:text-brand-blue sm:inline-flex dark:text-white/55 dark:hover:bg-white/10"
              href={selectedSlug ? `/member/${selectedSlug}` : "/member"}
              target="_blank"
            >
              <ArrowSquareOut className="mr-1.5" size={16} />
              View profile
            </Link>
            <form action="/api/admin/logout" method="post">
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

      <div className="mx-auto grid max-w-[1680px] lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="border-b border-[#dee4ef] p-4 dark:border-white/10 lg:sticky lg:top-[69px] lg:h-[calc(100dvh-69px)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <p className="px-2 font-mono text-[10px] font-bold tracking-[0.16em] text-[#7e899d] uppercase dark:text-white/35">
            Editorial
          </p>
          <nav className="mt-2 space-y-1">
            <SidebarItem
              active={section === "overview"}
              label="Overview"
              onClick={() => setSection("overview")}
            />
            {EDITORIAL_SECTIONS.map((item) => (
              <SidebarItem
                active={section === item.id}
                key={item.id}
                label={item.label}
                live={item.id === "members"}
                onClick={() => setSection(item.id)}
              />
            ))}
          </nav>
          {section === "members" ? (
            <div className="mt-7 border-t border-[#dee4ef] pt-5 dark:border-white/10">
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
              <nav className="mt-2 space-y-1">
                {visibleMembers.map((member) => (
                  <button
                    className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${member.slug === selectedSlug && !showNew ? "bg-white shadow-[0_10px_24px_-20px_rgba(20,32,58,0.5)] dark:bg-white/10" : "hover:bg-white/70 dark:hover:bg-white/[0.05]"}`}
                    key={member.slug}
                    onClick={() => selectMember(member)}
                    type="button"
                  >
                    <span className="relative grid size-9 shrink-0 place-items-end overflow-hidden rounded-lg bg-[#e9edf5] dark:bg-white/10">
                      {member.hasPortrait ? (
                        <Image
                          alt=""
                          className="object-contain object-bottom"
                          fill
                          sizes="36px"
                          src={`/members/${member.slug}.png`}
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
                      <span className="block truncate text-sm font-semibold">{member.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-[#778299] dark:text-white/45">
                        {member.division}
                      </span>
                    </span>
                  </button>
                ))}
              </nav>
            </div>
          ) : null}
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
                  onSaved={(record) => {
                    setRecords((current) => [
                      ...current.filter((item) => item.slug !== record.slug),
                      record,
                    ]);
                    setSelectedSlug(record.slug);
                    setShowNew(false);
                  }}
                />
              </>
            ) : (
              <EditorialOverview section={section} onChooseMembers={() => setSection("members")} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function SidebarItem({
  active,
  label,
  live = false,
  onClick,
}: {
  active: boolean;
  label: string;
  live?: boolean;
  onClick: () => void;
}) {
  const status = live ? "LIVE" : label === "Overview" ? "HOME" : "SOON";
  return (
    <button
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${active ? "bg-white text-brand-blue shadow-[0_10px_24px_-20px_rgba(20,32,58,0.5)] dark:bg-white/10" : "text-[#566177] hover:bg-white/70 dark:text-white/55 dark:hover:bg-white/[0.05]"}`}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      <span
        className={`font-mono text-[10px] font-normal ${live ? "text-brand-blue" : "text-[#8993a7] dark:text-white/30"}`}
      >
        {status}
      </span>
    </button>
  );
}

function EditorialOverview({
  onChooseMembers,
  section,
}: {
  onChooseMembers: () => void;
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
            ? "Choose a collection from the sidebar. Member profiles are ready to edit; the remaining editorial collections are intentionally reserved for their dedicated publishing workflows."
            : `${label} is reserved for its own editorial workflow. It will be added here without changing the member workspace.`}
        </p>
      )}
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {EDITORIAL_SECTIONS.map((item) => (
          <button
            className={`rounded-2xl border p-5 text-left transition ${item.id === "members" ? "border-brand-blue/30 bg-brand-blue/[0.04] hover:border-brand-blue hover:bg-brand-blue/[0.08]" : "border-[#dfe4ee] bg-white/55 opacity-60 dark:border-white/10 dark:bg-white/[0.025]"}`}
            disabled={item.id !== "members"}
            key={item.id}
            onClick={onChooseMembers}
            type="button"
          >
            <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-brand-blue uppercase">
              {item.id === "members" ? "Available" : "Reserved"}
            </span>
            <span className="mt-2 block font-display text-xl font-semibold tracking-[-0.03em]">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MemberEditor({
  activeTab,
  initialMember,
  initialProfile,
  onSaved,
}: {
  activeTab: EditorTab;
  initialMember?: Member;
  initialProfile?: CmsMemberProfile;
  onSaved: (record: CmsMemberRecord) => void;
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
    initialProfile?.photoKey
      ? `/api/member-cms/media/${initialProfile.photoKey}`
      : initialMember
        ? `/members/${initialMember.slug}.png`
        : undefined,
  );
  const [photoUpload, setPhotoUpload] = useState<string>();
  const [status, setStatus] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const fileInput = useRef<HTMLInputElement>(null);
  const mutateProfile = (update: (current: CmsMemberProfile) => CmsMemberProfile) =>
    setProfile((current) => update(copyProfile(current)));
  const updateDraft = <K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const readPhoto = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      setPhotoSource(result);
      setPhotoUpload(result);
      mutateProfile((current) => ({
        ...current,
        photoPosition: current.photoPosition ?? { x: 50, y: 50, zoom: 1 },
      }));
    };
    reader.readAsDataURL(file);
  };
  const save = async () => {
    if (!draft.name.trim() || !draft.slug.trim()) return;
    setStatus("saving");
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
        if (!photoResponse.ok) throw new Error("portrait upload failed");
        const photo = (await photoResponse.json()) as { key: string };
        nextProfile = { ...nextProfile, photoKey: photo.key };
      }
      const member = draftToMember(draft);
      const response = await fetch(`/api/admin/members/${encodeURIComponent(member.slug)}`, {
        body: JSON.stringify({ member, profile: nextProfile }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      if (!response.ok) throw new Error("profile save failed");
      onSaved((await response.json()) as CmsMemberRecord);
      setPhotoUpload(undefined);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-[#dee4ef] pb-7 dark:border-white/10">
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
        <button
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171b25] px-4 text-sm font-semibold text-white transition hover:bg-brand-blue active:scale-[0.98] dark:bg-white dark:text-[#151820]"
          disabled={status === "saving"}
          onClick={save}
          type="button"
        >
          {status === "saved" ? (
            <Check size={18} weight="bold" />
          ) : (
            <FloppyDisk size={18} weight="bold" />
          )}
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save changes"}
        </button>
      </div>
      {status === "error" ? (
        <p className="mt-4 rounded-xl bg-brand-red-50 px-4 py-3 text-sm text-brand-red dark:bg-brand-red/15 dark:text-brand-red-100">
          The changes could not be saved. Check that the CMS API and storage are configured.
        </p>
      ) : null}
      {activeTab === "profile" ? (
        <ProfileTab
          draft={draft}
          fileInput={fileInput}
          onPhoto={readPhoto}
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
    </>
  );
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
  const position = profile.photoPosition ?? { x: 50, y: 50, zoom: 1 };
  return (
    <div className="mt-7 space-y-10">
      <div className="grid gap-7 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <div>
          <CropPreview profile={profile} source={photoSource} />
          <input
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => onPhoto(event.target.files?.[0])}
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Photo zoom">
          <input
            className="h-10 w-full accent-brand-blue"
            max="2.5"
            min="1"
            onChange={(e) =>
              onProfile((current) => ({
                ...current,
                photoPosition: { ...position, zoom: Number(e.target.value) },
              }))
            }
            step="0.05"
            type="range"
            value={position.zoom}
          />
        </Field>
        <Field label="Horizontal crop">
          <input
            className="h-10 w-full accent-brand-blue"
            max="100"
            min="0"
            onChange={(e) =>
              onProfile((current) => ({
                ...current,
                photoPosition: { ...position, x: Number(e.target.value) },
              }))
            }
            type="range"
            value={position.x}
          />
        </Field>
        <Field label="Vertical crop">
          <input
            className="h-10 w-full accent-brand-blue"
            max="100"
            min="0"
            onChange={(e) =>
              onProfile((current) => ({
                ...current,
                photoPosition: { ...position, y: Number(e.target.value) },
              }))
            }
            type="range"
            value={position.y}
          />
        </Field>
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
