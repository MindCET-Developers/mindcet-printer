export function sanitizePdfFileName(fileName: string) {
  const originalName = fileName
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop();

  const base = originalName
    ?.normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 180);

  const safeName = base || "document.pdf";
  return safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
}

export function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
