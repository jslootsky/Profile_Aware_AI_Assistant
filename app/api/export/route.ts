import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function buildText(report: Record<string, unknown>) {
  return [
    `Summary: ${report.summary || ""}`,
    `Assumptions: ${(report.assumptions as string[] | undefined)?.join("; ") || ""}`,
    `Recommendation: ${report.recommendation || ""}`,
    `Steps: ${(report.steps as string[] | undefined)?.join("; ") || ""}`,
    `Risks: ${(report.risks as string[] | undefined)?.join("; ") || ""}`
  ].join("\n\n");
}

async function generatePdf(text: string) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const lines = text.split("\n");
  let y = 760;
  for (const line of lines) {
    page.drawText(line.slice(0, 110), { x: 40, y, size: 11, font, color: rgb(0, 0, 0) });
    y -= 16;
    if (y < 40) break;
  }

  return pdfDoc.save();
}

export async function POST(req: NextRequest) {
  const { format, report } = await req.json();
  const text = buildText(report);

  if (format === "pdf") {
    const bytes = await generatePdf(text);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=report.pdf"
      }
    });
  }

  const doc = `<html><body><pre>${text}</pre></body></html>`;
  return new NextResponse(doc, {
    headers: {
      "Content-Type": "application/msword",
      "Content-Disposition": "attachment; filename=report.doc"
    }
  });
}
