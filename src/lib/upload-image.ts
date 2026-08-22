'use client';

/**
 * Send an image to the server and get back its stored URI.
 *
 * Every tool that takes a picture goes through here rather than embedding the bytes in a server
 * action argument — see the comment in /api/uploads for why that fails above about a megabyte.
 * The returned URI is short, so it passes through actions safely, and the providers already know
 * how to resolve one (fetchReferenceBytes handles data:, http(s) and stored URIs alike).
 */
export async function uploadImage(file: File, idToken: string): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
    body,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.error ?? `Upload failed (${res.status})`);
  }
  const { uri } = await res.json();
  return uri as string;
}

/** Convert a data URL back into a File so it can go through the same upload path. */
export async function dataUrlToFile(dataUrl: string, name = "upload.png"): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}
