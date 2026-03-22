/**
 * BOM Import Script
 * Run: npx ts-node --project tsconfig.json scripts/import-bom.ts
 */

import { PrismaClient, StageType } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

// ── Category auto-detection ──────────────────────────────────────────────────
function guessCategory(name: string): { catCode: string; catName: string } {
  const n = name.toLowerCase();
  if (n.includes('capacitor') || n.includes('cap ') || n.match(/^\d+uf/i) || n.match(/^\d+pf/i))
    return { catCode: 'CAP', catName: 'Capacitors' };
  if (n.includes('mosfet') || n.includes('igbt') || n.includes('transistor'))
    return { catCode: 'MOS', catName: 'MOSFETs / IGBTs' };
  if (n.includes('resistor') || n.match(/^\d+r$/i) || n.match(/^\d+[kKmM]r?$/))
    return { catCode: 'RES', catName: 'Resistors' };
  if (n.includes('pcb') || n.includes('brain board') || n.includes('power stage'))
    return { catCode: 'PCB', catName: 'PCB Assemblies' };
  if (n.includes('connector') || n.includes('header') || n.includes('terminal') || n.includes('bullet'))
    return { catCode: 'CON', catName: 'Connectors' };
  if (n.includes('bolt') || n.includes('screw') || n.includes('nut ') || n.includes('washer') || n.includes('fastener') || n.includes('stand off'))
    return { catCode: 'HRD', catName: 'Hardware / Fasteners' };
  if (n.includes('wire') || n.includes('cable') || n.includes('loom') || n.includes('crimped'))
    return { catCode: 'WIR', catName: 'Wires & Cables' };
  if (n.includes('heatsink') || n.includes('heat sink') || n.includes('thermal'))
    return { catCode: 'THR', catName: 'Thermal Management' };
  if (n.includes('inductor') || n.includes('coil') || n.includes('choke') || n.includes('zapper') || n.includes('core'))
    return { catCode: 'IND', catName: 'Inductors / Coils' };
  if (n.includes('diode') || n.includes('led') || n.includes('rectifier'))
    return { catCode: 'DIO', catName: 'Diodes / LEDs' };
  if (n.includes('ic ') || n.includes(' ic') || n.includes('driver') || n.includes('controller') || n.includes('optocoupler') || n.includes('sensor'))
    return { catCode: 'IC', catName: 'ICs & Sensors' };
  if (n.includes('bus bar') || n.includes('busbar') || n.includes('copper') || n.includes('aluminium'))
    return { catCode: 'BUS', catName: 'Bus Bars / Conductors' };
  if (n.includes('enclosure') || n.includes('housing') || n.includes('panel') || n.includes('cover') || n.includes('shell'))
    return { catCode: 'ENC', catName: 'Enclosures & Panels' };
  if (n.includes('transformer') || n.includes('relay') || n.includes('contactor'))
    return { catCode: 'PWR', catName: 'Power Components' };
  if (n.includes('label') || n.includes('sticker') || n.includes('tape') || n.includes('sleeve'))
    return { catCode: 'PKG', catName: 'Packaging & Labels' };
  return { catCode: 'GEN', catName: 'General Components' };
}

// ── Product mapping: sheet name → product code + name ───────────────────────
const PRODUCT_MAP: Record<string, { code: string; name: string }> = {
  'SM100_BOM':           { code: 'SM100',   name: 'SMX SM100 Controller' },
  'SM150_BOM':           { code: 'SM150',   name: 'SMX SM150 Controller' },
  'SM250_BOM':           { code: 'SM250',   name: 'SMX SM250 Controller' },
  'POWERLAND_SM250_BOM': { code: 'PLSM250', name: 'Powerland SM250 Controller' },
  'SM 300_BOM':          { code: 'SM300',   name: 'SMX SM300 Controller' },
  'SM 350_BOM':          { code: 'SM350',   name: 'SMX SM350 Controller' },
  'C350_BOM':            { code: 'C350',    name: 'SMX C350 Controller' },
  'CL350_BOM':           { code: 'CL350',   name: 'SMX CL350 Controller' },
  'C700_BOM':            { code: 'C700',    name: 'SMX C700 Controller' },
  'CL700_BOM':           { code: 'CL700',   name: 'SMX CL700 Controller' },
  'CL700_LQ_BOM':        { code: 'CL700LQ', name: 'SMX CL700 LQ Controller' },
  'CL1000_BOM':          { code: 'CL1000',  name: 'SMX CL1000 Controller' },
  'C1000_BOM':           { code: 'C1000',   name: 'SMX C1000 Controller' },
  'CL1400_BOM':          { code: 'CL1400',  name: 'SMX CL1400 Controller' },
  'CC1000_BOM':          { code: 'CC1000',  name: 'SMX CC1000 Controller' },
  'Electro_BOM':         { code: 'ELECTRO', name: 'Electro Controller' },
};

async function main() {
  const raw = JSON.parse(fs.readFileSync('/tmp/bom_data.json', 'utf-8'));
  const { boms, unique_components }: {
    boms: Record<string, { component: string; quantity: number }[]>;
    unique_components: string[];
  } = raw;

  console.log(`\n📦 Importing ${unique_components.length} unique components across ${Object.keys(boms).length} BOMs...\n`);

  // ── 1. Ensure categories exist ──────────────────────────────────────────
  const categoryMap = new Map<string, string>(); // code → id
  const catDefs = new Map<string, string>(); // code → name

  for (const comp of unique_components) {
    const { catCode, catName } = guessCategory(comp);
    catDefs.set(catCode, catName);
  }

  for (const [code, name] of Array.from(catDefs)) {
    const cat = await prisma.materialCategory.upsert({
      where: { code },
      update: {},
      create: { code, name },
    });
    categoryMap.set(code, cat.id);
    console.log(`  ✓ Category ${code} – ${name}`);
  }

  // ── 2. Create RawMaterial for each unique component ──────────────────────
  const materialMap = new Map<string, string>(); // component name → material id

  let matCreated = 0, matExisting = 0;
  for (const compName of unique_components) {
    const { catCode } = guessCategory(compName);
    const catId = categoryMap.get(catCode)!;

    // Check if already exists by name
    const existing = await prisma.rawMaterial.findFirst({
      where: { name: { equals: compName, mode: 'insensitive' } },
    });

    if (existing) {
      materialMap.set(compName, existing.id);
      matExisting++;
      continue;
    }

    // Generate barcode: {catCode}{seq}
    const count = await prisma.rawMaterial.count({
      where: { barcode: { startsWith: catCode } },
    });
    const barcode = `${catCode}${String(count + 1).padStart(3, '0')}`;
    const matCount = await prisma.rawMaterial.count();
    const code = `MAT/${String(matCount + 1).padStart(3, '0')}`;

    const mat = await prisma.rawMaterial.create({
      data: {
        code,
        barcode,
        name: compName,
        unit: 'PCS',
        categoryId: catId,
        minimumStock: 0,
        reorderPoint: 0,
      },
    });
    materialMap.set(compName, mat.id);
    matCreated++;
  }

  console.log(`\n✅ Materials: ${matCreated} created, ${matExisting} already existed\n`);

  // ── 3. Ensure products exist and create BOMItems ─────────────────────────
  let bomCreated = 0, bomSkipped = 0;

  for (const [sheetName, items] of Object.entries(boms)) {
    const prodInfo = PRODUCT_MAP[sheetName];
    if (!prodInfo) { console.log(`⚠️  No product mapping for ${sheetName}`); continue; }

    // Upsert product
    const product = await prisma.product.upsert({
      where: { code: prodInfo.code },
      update: {},
      create: { code: prodInfo.code, name: prodInfo.name, active: true },
    });

    console.log(`\n  📋 ${sheetName} → Product ${prodInfo.code} (${items.length} items)`);

    for (const { component, quantity } of items) {
      const matId = materialMap.get(component);
      if (!matId) { console.log(`    ⚠️  No material for: ${component}`); continue; }

      try {
        await prisma.bOMItem.upsert({
          where: { productId_rawMaterialId_voltage: { productId: product.id, rawMaterialId: matId, voltage: '' } },
          update: { quantityRequired: quantity },
          create: {
            productId: product.id,
            rawMaterialId: matId,
            quantityRequired: quantity,
            unit: 'PCS',
            voltage: '',
          },
        });
        bomCreated++;
      } catch {
        bomSkipped++;
      }
    }
  }

  console.log(`\n✅ BOM Items: ${bomCreated} created/updated, ${bomSkipped} skipped`);
  console.log('\n🎉 Import complete!\n');
}

main().catch(console.error).finally(() => prisma.$disconnect());
