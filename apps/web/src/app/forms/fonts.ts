import { Fraunces } from "next/font/google";

/**
 * The one face a form can pick that the root layout doesn't load (Hanken
 * Grotesk, Geist and Geist Mono come from there). Shared by the public
 * forms layout and the admin preview.
 */
export const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});
