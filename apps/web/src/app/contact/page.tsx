import type { Metadata } from "next";

import { ContactContent } from "@/components/contact/contact-content";
import { fetchContactSettings } from "@/lib/contact-settings";

export const metadata: Metadata = {
  title: "Contact — MGM Laboratory",
  description: "Get in touch with MGM Laboratory.",
};

export const revalidate = 0;

export default async function ContactPage() {
  const settings = await fetchContactSettings();
  return <ContactContent settings={settings} />;
}
