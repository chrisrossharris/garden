import PDFDocument from 'pdfkit';
import { getStore } from '@netlify/blobs';
import { env } from '@/lib/env';

export async function generateBlueprintPdf(input: {
  spaceName: string;
  zip: string;
  zone: string;
  frostRange: string;
  areas: { name: string; sqft: string; sun: string }[];
  recommendations: { area: string; plant: string; qty: number; spacing: number; zone?: string | null }[];
  timeline: { month: string; summary: string }[];
  maintenance: string[];
  purchaseId: string;
}) {
  const doc = new PDFDocument({ margin: 40 });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  doc.fontSize(28).text('Garden Blueprint', { align: 'left' });
  doc.moveDown();
  doc.fontSize(14).text(`${input.spaceName} (${input.zip})`);
  doc.text(`Zone ${input.zone}`);
  doc.text(`Frost Window: ${input.frostRange}`);

  doc.addPage().fontSize(18).text('Area Breakdown');
  input.areas.forEach((a) => {
    doc.fontSize(12).text(`${a.name} • ${a.sqft} sqft • ${a.sun}`);
  });

  doc.addPage().fontSize(18).text('Recommended Plantings');
  doc.fontSize(11).text('Quantity estimate = floor((sqft * 144) / spacing_inches²)');
  doc.moveDown();
  input.recommendations.forEach((r) => {
    const zone = r.zone ? `, zone ${r.zone}` : '';
    doc.text(`${r.area}: ${r.plant} x${r.qty} (spacing ${r.spacing}"${zone})`);
  });

  doc.addPage().fontSize(18).text('Month-by-Month Timeline');
  input.timeline.forEach((t) => doc.fontSize(12).text(`${t.month}: ${t.summary}`));

  doc.addPage().fontSize(18).text('Maintenance Checklist');
  input.maintenance.forEach((m) => doc.fontSize(12).text(`- ${m}`));

  doc.end();

  await new Promise<void>((resolve) => doc.on('end', () => resolve()));

  const pdfBuffer = Buffer.concat(chunks);
  const key = `blueprints/${input.purchaseId}.pdf`;
  const store = getStore(env.STORAGE_BUCKET || 'garden-os-blueprints');
  const payload = pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength);
  await store.set(key, payload);

  if (env.STORAGE_PUBLIC_BASE_URL) {
    return `${env.STORAGE_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  }
  return key;
}
