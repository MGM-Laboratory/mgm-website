import Link from "next/link";
import { Keyhole } from "@phosphor-icons/react/dist/ssr";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="admin-shell grid min-h-[100dvh] place-items-center px-5 py-10">
      <section className="admin-login-panel w-full max-w-md rounded-[1.75rem] border border-white/10 bg-[#12151d] p-7 text-white shadow-2xl sm:p-10">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-blue text-white shadow-[0_12px_26px_-14px_rgba(78,117,200,0.9)]">
          <Keyhole size={25} weight="bold" />
        </div>
        <p className="mt-8 font-mono text-[11px] tracking-[0.18em] text-white/45 uppercase">
          MGM Laboratory
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.05em]">
          Editor access
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-white/60">
          Enter the laboratory passphrase to manage member profiles.
        </p>
        <form action="/api/admin/login" method="post" className="mt-8 space-y-3">
          <label className="block text-sm font-medium text-white/80" htmlFor="passphrase">
            Passphrase
          </label>
          <input
            autoComplete="current-password"
            autoFocus
            className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 text-white outline-none transition placeholder:text-white/30 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20"
            id="passphrase"
            name="passphrase"
            required
            type="password"
          />
          {error ? (
            <p className="text-sm text-brand-red-200">That passphrase does not match.</p>
          ) : null}
          <button
            className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-blue px-5 text-sm font-semibold text-white transition hover:bg-brand-blue/90 active:scale-[0.98]"
            type="submit"
          >
            Open workspace
          </button>
        </form>
        <Link
          href="/"
          className="mt-7 inline-block text-sm text-white/45 transition hover:text-white"
        >
          Return to the website
        </Link>
      </section>
    </main>
  );
}
