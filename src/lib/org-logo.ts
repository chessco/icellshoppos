export async function fetchOrgLogoDataUrl(): Promise<string | undefined> {
  const response = await fetch("/api/org/logo", { cache: "no-store" });
  if (!response.ok) return undefined;

  const blob = await response.blob();
  if (!blob.size) return undefined;

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      if (!value) {
        reject(new Error("Failed to read logo file"));
        return;
      }
      resolve(value);
    };
    reader.onerror = () => reject(new Error("Failed to read logo file"));
    reader.readAsDataURL(blob);
  });
}