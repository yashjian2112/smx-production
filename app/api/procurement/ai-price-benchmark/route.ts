import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/procurement/ai-price-benchmark
// Body: { materialId }
// Asks Claude to estimate a fair INR price for the material based on its name, unit, category
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { materialId } = await req.json();
  if (!materialId) return NextResponse.json({ error: 'materialId required' }, { status: 400 });

  const mat = await prisma.rawMaterial.findUnique({
    where: { id: materialId },
    include: { category: { select: { name: true } } },
  });
  if (!mat) return NextResponse.json({ error: 'Material not found' }, { status: 404 });

  const prompt = `You are a procurement pricing expert for an electronics manufacturing company in India (Gujarat).

Estimate a fair wholesale/B2B purchase price in INR for the following raw material:

Material: ${mat.name}
Unit: ${mat.unit}${mat.purchaseUnit ? ` (purchase unit: ${mat.purchaseUnit}, conversion: ${mat.conversionFactor} ${mat.unit} per ${mat.purchaseUnit})` : ''}
Category: ${mat.category?.name ?? 'Electronics component'}
HSN Code: ${mat.hsnCode ?? 'not specified'}
Description: ${mat.description ?? 'not provided'}

Reply ONLY with a JSON object in this exact format (no explanation):
{
  "pricePerUnit": <number in INR per ${mat.unit}>,
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "notes": "<brief reason, e.g. typical capacitor market price>"
}`;

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = (resp.content[0] as { type: string; text: string }).text.trim();
    const parsed = JSON.parse(text);
    const price = Number(parsed.pricePerUnit);

    if (!price || price <= 0) throw new Error('Invalid price from AI');

    // Save benchmark to material
    await prisma.rawMaterial.update({
      where: { id: materialId },
      data: { aiPriceBenchmark: price },
    });

    return NextResponse.json({ price, confidence: parsed.confidence, notes: parsed.notes, materialName: mat.name, unit: mat.unit });
  } catch (e) {
    return NextResponse.json({ error: 'AI price estimation failed', detail: String(e) }, { status: 500 });
  }
}
