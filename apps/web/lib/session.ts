import { getSessionFromHeaders } from "@zuvigo/auth";
import { redirect } from "next/navigation";

async function headers() {
  const { headers: nextHeaders } = await import("next/headers");
  return nextHeaders();
}

export async function requirePageSession() {
  const session = await getSessionFromHeaders(await headers());
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

export async function getOptionalPageSession() {
  return getSessionFromHeaders(await headers());
}
