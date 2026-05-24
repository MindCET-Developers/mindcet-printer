export function sanitizePdfFileName(fileName: string) {
  const base = fileName
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();

  const safeName = base || "document.pdf";
  return safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`;
}

export function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
