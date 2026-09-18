"use client";

import { Check, Globe, GraduationCap } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { CareerCvDropzone } from "@/components/careers/career-cv-dropzone";
import { PhoneCountrySelect } from "@/components/careers/phone-country-select";
import { submitApplication } from "@/lib/career-apply";
import { UB_FACULTIES } from "@/lib/ub-faculties";

type ApplicantType = "ub-student" | "general";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// NIM: 15 digits starting with 2. Lecturers/staff: NIDN 10 digits, NIP 18 digits.
const ID_PATTERN = /^(2\d{14}|\d{10}|\d{18})$/;
const PHONE_PATTERN = /^[0-9][0-9 ()\-]{5,19}$/;

function inputClass(hasError: boolean) {
  return `h-12 w-full rounded-xl border bg-white px-4 text-[15px] text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-4)] dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/30 ${
    hasError
      ? "border-brand-red/60 focus:border-brand-red focus:ring-4 focus:ring-brand-red/10 dark:border-brand-red/50"
      : "border-[var(--line-strong)] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10"
  }`;
}

const LABEL = "mb-2 block text-sm font-medium text-[var(--ink)] dark:text-white";
const FIELD_ERROR = "mt-2 text-sm text-brand-red";
const EYEBROW =
  "font-mono text-[10px] font-bold tracking-[0.16em] text-[var(--ink-3)] uppercase dark:text-white/45";

export function JobApplicationForm({
  job,
  maxCvBytes,
}: {
  job: { slug: string; title: string; deadline: string };
  maxCvBytes: number;
}) {
  const [applicantType, setApplicantType] = useState<ApplicantType>("ub-student");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("+62");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [nim, setNim] = useState("");
  const [faculty, setFaculty] = useState("");
  const [motivation, setMotivation] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "success">("idle");
  const [progress, setProgress] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isUb = applicantType === "ub-student";
  const successHeadingRef = useRef<HTMLHeadingElement>(null);

  // The success card collapses a long, scrolled-through form down to a
  // short one. Native scroll position doesn't retreat on its own, which
  // left visitors stranded below the (now much shorter) footer looking at
  // blank space. Land on top, then let ScrollTrigger (CtaFooter's fade-ups
  // and back-to-top button) re-measure against the new, shorter layout.
  // The submit button (and the rest of the form) unmounts along with it,
  // so focus also moves to the success heading — otherwise keyboard and
  // screen-reader users lose their place entirely.
  useEffect(() => {
    if (status !== "success") return;
    window.scrollTo(0, 0);
    ScrollTrigger.refresh();
    successHeadingRef.current?.focus();
  }, [status]);

  const touch = (field: string) =>
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));

  const fullNameError =
    touched.fullName || attempted
      ? fullName.trim().length >= 2
        ? null
        : "Enter your full name."
      : null;
  // Email is validated on blur only, and an empty field is left alone until
  // the applicant actually submits - no punishing an in-progress field.
  const emailError =
    touched.email || attempted
      ? email.trim()
        ? EMAIL_PATTERN.test(email.trim())
          ? null
          : "That doesn't look like a valid email address."
        : "Email is required."
      : null;
  const phoneError =
    touched.phone || attempted
      ? PHONE_PATTERN.test(phoneNumber.trim())
        ? null
        : "Enter a valid phone number."
      : null;
  const nimError =
    (touched.nim || attempted) && isUb
      ? nim.trim()
        ? ID_PATTERN.test(nim.trim())
          ? null
          : "Use a 15-digit NIM starting with 2 (or a 10-digit NIDN / 18-digit NIP)."
        : "Your NIM is required for Universitas Brawijaya applicants."
      : null;
  const facultyError = attempted && isUb && !faculty ? "Choose the faculty you're based in." : null;
  const motivationError =
    touched.motivation || attempted
      ? motivation.trim().length >= 10
        ? null
        : "Tell us a bit more, at least 10 characters."
      : null;
  const termsError = attempted && !agreedToTerms ? "You must agree to continue." : null;

  const invalid =
    Boolean(
      fullNameError ||
      emailError ||
      phoneError ||
      nimError ||
      facultyError ||
      motivationError ||
      termsError,
    ) ||
    (!cvFile && !cvError);

  const submit = async () => {
    setAttempted(true);
    setSubmitError(null);
    // Validated from the live field values - render-time errors only cover
    // touched fields, and an untouched empty field must not slip through.
    const firstError = [
      fullName.trim().length >= 2 ? null : "Enter your full name.",
      email.trim()
        ? EMAIL_PATTERN.test(email.trim())
          ? null
          : "That doesn't look like a valid email address."
        : "Email is required.",
      PHONE_PATTERN.test(phoneNumber.trim()) ? null : "Enter a valid phone number.",
      isUb
        ? nim.trim()
          ? ID_PATTERN.test(nim.trim())
            ? null
            : "Use a 15-digit NIM starting with 2 (or a 10-digit NIDN / 18-digit NIP)."
          : "Your NIM is required for Universitas Brawijaya applicants."
        : null,
      isUb && !faculty ? "Choose the faculty you're based in." : null,
      motivation.trim().length >= 10 ? null : "Tell us a bit more, at least 10 characters.",
      agreedToTerms ? null : "You must agree to continue.",
    ].find((message) => message !== null);
    if (firstError || !cvFile) return;

    setStatus("uploading");
    setProgress(0);
    const result = await submitApplication(
      job.slug,
      {
        applicantType,
        fullName: fullName.trim(),
        email: email.trim(),
        phoneCountry,
        phoneNumber: phoneNumber.trim(),
        nim: isUb ? nim.trim() : undefined,
        faculty: isUb ? faculty : undefined,
        motivation: motivation.trim(),
        agreedToTerms,
        cvFile,
      },
      (fraction) => setProgress(fraction),
    );
    if (result.ok) {
      setStatus("success");
    } else {
      setStatus("idle");
      setSubmitError(result.message);
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-[var(--line)] px-8 py-16 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-green-50 text-brand-green dark:bg-brand-green/15 dark:text-[#6fd3a5]">
          <Check aria-hidden="true" size={26} strokeWidth={2.25} />
        </span>
        <h2
          className="mt-5 font-display text-2xl font-semibold text-[#0e1116] outline-none dark:text-white"
          ref={successHeadingRef}
          tabIndex={-1}
        >
          Application received!
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[var(--ink-2)] dark:text-[#c3c7d1]">
          Thanks for applying to <span className="font-semibold">{job.title}</span>. The lab will
          review your application and reach out by email.
        </p>
        <Link
          className="mt-6 inline-flex h-10 items-center rounded-full border border-[var(--line)] px-5 text-sm font-semibold text-[var(--ink-2)] transition hover:border-brand-blue hover:text-brand-blue dark:text-[#c3c7d1]"
          href={`/careers/${job.slug}`}
        >
          Back to the role
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {/* Applicant type */}
      <section>
        <p className={EYEBROW}>Who are you applying as?</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            aria-checked={isUb}
            className={`flex items-start gap-4 rounded-2xl border p-5 text-left transition ${
              isUb
                ? "border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue"
                : "border-[var(--line)] bg-white hover:border-brand-blue/50 dark:bg-white/[0.03]"
            }`}
            onClick={() => setApplicantType("ub-student")}
            role="radio"
            type="button"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-blue/10 text-brand-blue">
              <GraduationCap aria-hidden="true" size={20} strokeWidth={2} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[#0e1116] dark:text-white">
                Universitas Brawijaya student
              </span>
              <span className="mt-1 block text-xs leading-5 text-[var(--ink-3)]">
                You&apos;re a UB student or lecturer, so include your NIM/NIDN and faculty.
              </span>
            </span>
          </button>
          <button
            aria-checked={!isUb}
            className={`flex items-start gap-4 rounded-2xl border p-5 text-left transition ${
              !isUb
                ? "border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue"
                : "border-[var(--line)] bg-white hover:border-brand-blue/50 dark:bg-white/[0.03]"
            }`}
            onClick={() => setApplicantType("general")}
            role="radio"
            type="button"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-green/10 text-brand-green">
              <Globe aria-hidden="true" size={20} strokeWidth={2} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[#0e1116] dark:text-white">
                General applicant
              </span>
              <span className="mt-1 block text-xs leading-5 text-[var(--ink-3)]">
                You&apos;re applying from outside Universitas Brawijaya.
              </span>
            </span>
          </button>
        </div>
      </section>

      {/* About you */}
      <section>
        <p className={EYEBROW}>About you</p>
        <div className="mt-4 space-y-5">
          <div>
            <label className={LABEL} htmlFor="fullName">
              Full name
            </label>
            <input
              autoComplete="name"
              className={inputClass(Boolean(fullNameError))}
              id="fullName"
              onBlur={() => touch("fullName")}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your full name"
              type="text"
              value={fullName}
            />
            {fullNameError ? <p className={FIELD_ERROR}>{fullNameError}</p> : null}
          </div>

          <div>
            <label className={LABEL} htmlFor="email">
              Email
            </label>
            <input
              autoComplete="email"
              className={inputClass(Boolean(emailError))}
              id="email"
              inputMode="email"
              onBlur={() => touch("email")}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@student.ub.ac.id"
              type="email"
              value={email}
            />
            {emailError ? <p className={FIELD_ERROR}>{emailError}</p> : null}
          </div>

          <div>
            <label className={LABEL} htmlFor="phoneNumber">
              Phone number
            </label>
            <div className="flex gap-3">
              <PhoneCountrySelect
                hasError={Boolean(phoneError)}
                onChange={setPhoneCountry}
                value={phoneCountry}
              />
              <input
                aria-describedby={phoneError ? "phone-error" : undefined}
                autoComplete="tel"
                className={inputClass(Boolean(phoneError))}
                id="phoneNumber"
                inputMode="tel"
                onBlur={() => touch("phone")}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="81234567890"
                type="text"
                value={phoneNumber}
              />
            </div>
            {phoneError ? (
              <p className={FIELD_ERROR} id="phone-error">
                {phoneError}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* UB-specific fields */}
      {isUb ? (
        <section>
          <p className={EYEBROW}>Universitas Brawijaya</p>
          <div className="mt-4 space-y-5">
            <div>
              <label className={LABEL} htmlFor="nim">
                NIM / NIDN / NIP
              </label>
              <input
                className={inputClass(Boolean(nimError))}
                id="nim"
                inputMode="numeric"
                onBlur={() => touch("nim")}
                onChange={(event) => setNim(event.target.value)}
                placeholder="245150300111024"
                type="text"
                value={nim}
              />
              {nimError ? (
                <p className={FIELD_ERROR}>{nimError}</p>
              ) : (
                <p className="mt-2 text-xs leading-5 text-[var(--ink-3)]">
                  Your 15-digit NIM, e.g. 245150300111024. Lecturers and staff can use their
                  10-digit NIDN or 18-digit NIP instead.
                </p>
              )}
            </div>
            <div>
              <label className={LABEL} htmlFor="faculty">
                Faculty
              </label>
              <select
                className={`${inputClass(Boolean(facultyError))} appearance-none`}
                id="faculty"
                onBlur={() => touch("faculty")}
                onChange={(event) => setFaculty(event.target.value)}
                value={faculty}
              >
                <option value="">Choose your faculty</option>
                {UB_FACULTIES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {facultyError ? <p className={FIELD_ERROR}>{facultyError}</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* CV + motivation */}
      <section>
        <p className={EYEBROW}>Your application</p>
        <div className="mt-4 space-y-5">
          <div>
            <label className={LABEL} htmlFor="cv">
              CV / Resume
            </label>
            <CareerCvDropzone
              error={attempted && !cvFile && !cvError ? "Please attach your CV." : cvError}
              file={cvFile}
              maxBytes={maxCvBytes}
              onSelect={(file, error) => {
                setCvFile(file);
                setCvError(error);
              }}
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="motivation">
              Why are you interested in joining the lab?
            </label>
            <textarea
              className={`min-h-36 w-full resize-y rounded-xl border bg-white px-4 py-3 text-[15px] leading-6 text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-4)] dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/30 ${
                motivationError
                  ? "border-brand-red/60 focus:border-brand-red focus:ring-4 focus:ring-brand-red/10 dark:border-brand-red/50"
                  : "border-[var(--line-strong)] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10"
              }`}
              id="motivation"
              maxLength={8000}
              onBlur={() => touch("motivation")}
              onChange={(event) => setMotivation(event.target.value)}
              placeholder="What excites you about the lab, and what would you like to work on?"
              rows={6}
              value={motivation}
            />
            <div className="mt-1.5 flex items-start justify-between gap-4">
              {motivationError ? <p className={FIELD_ERROR}>{motivationError}</p> : <span />}
              <span className="font-mono text-[11px] text-[var(--ink-4)]">
                {motivation.length}/8000
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Agreement + submit */}
      <section className="border-t border-[var(--line)] pt-6">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            checked={agreedToTerms}
            className="mt-0.5 size-4 shrink-0 accent-brand-blue"
            onChange={(event) => setAgreedToTerms(event.target.checked)}
            type="checkbox"
          />
          <span className="text-sm leading-6 text-[var(--ink-2)] dark:text-[#c3c7d1]">
            I agree to the lab&apos;s{" "}
            <Link className="text-brand-blue hover:underline" href="/terms-of-services">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link className="text-brand-blue hover:underline" href="/privacy-policy">
              Privacy Policy
            </Link>
            , and consent to my details being used to process this application.
          </span>
        </label>
        {termsError ? <p className={`${FIELD_ERROR} mt-2`}>{termsError}</p> : null}

        {submitError ? (
          <p
            className="mt-5 rounded-xl border border-brand-red/30 bg-brand-red-50 px-4 py-3 text-sm text-brand-red dark:bg-brand-red/10"
            role="alert"
          >
            {submitError}
          </p>
        ) : null}

        <div className="mt-6">
          {status === "uploading" ? (
            <div className="space-y-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)] dark:bg-white/[0.08]">
                <div
                  aria-hidden="true"
                  className="h-full rounded-full bg-brand-blue transition-[width] duration-150"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="text-center font-mono text-[11px] text-[var(--ink-3)]">
                Uploading… {Math.round(progress * 100)}%
              </p>
            </div>
          ) : null}
          <button
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0e1116] px-8 text-sm font-semibold text-white transition hover:bg-brand-blue active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-[#0e1116] dark:hover:bg-brand-yellow"
            disabled={status === "uploading" || invalid}
            type="submit"
          >
            Submit application
          </button>
          <p className="mt-3 text-center text-xs text-[var(--ink-4)]">
            Applications close on{" "}
            {new Date(`${job.deadline}T00:00:00Z`).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            .
          </p>
        </div>
      </section>
    </form>
  );
}
