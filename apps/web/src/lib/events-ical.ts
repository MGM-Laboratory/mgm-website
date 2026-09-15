"use client";

import { env } from "@/lib/env";

/** The public .ics feed URL — calendar apps poll this to stay in sync. */
export function eventsFeedUrl(): string {
  return `${env.NEXT_PUBLIC_API_URL}/cms/events/calendar.ics`;
}

/** webcal:// variant — Apple Calendar and most calendar apps read this as "subscribe", not download. */
export function webcalUrl(httpUrl: string): string {
  return httpUrl.replace(/^https?:\/\//, "webcal://");
}

export function googleSubscribeUrl(httpUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(httpUrl))}`;
}

export function outlookSubscribeUrl(httpUrl: string): string {
  return `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(
    httpUrl,
  )}&name=${encodeURIComponent("MGM Laboratory Events")}`;
}
