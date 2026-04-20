// Seed script for IT CAN BE LLC entity structure
// Run this after initializing the database to create the tenant hierarchy

import { db } from '../../server/db';
import * as schema from '../system.schema';
import { hashPassword } from '../../server/lib/password';

export async function seedItCanBeLLC() {
  console.log('🌱 Seeding IT CAN BE LLC entity structure...');

  // Create IT CAN BE LLC (parent holding company)
  const [itCanBeLLC] = await db.insert(schema.tenants).values({
    name: 'IT CAN BE LLC',
    slug: 'it-can-be-llc',
    type: 'holding',
    taxId: null, // Add actual EIN when ready
    metadata: {
      jurisdiction: 'Wyoming',
      formation_date: '2024-10-29',
      description: 'Wyoming Series and Close LLC - Parent holding company',
      // IT CAN BE LLC members (verified from ITCB Operating Agreement 2024-10-29):
      //   Oct 29 – Dec 15, 2024: Nicholas Bianchi 85%, Sharon Jones 15% (individual)
      //   Dec 16, 2024 – present: JAV LLC 85%, Sharon Jones 15% (Nick assigned to JAV)
      members: [
        { name: 'JEAN ARLENE VENTURING LLC', pct: 85 },
        { name: 'Sharon E Jones', pct: 15 },
      ],
      members_2024: [
        { name: 'Nicholas Bianchi', pct: 85, endDate: '2024-12-15' },
        { name: 'JEAN ARLENE VENTURING LLC', pct: 85, startDate: '2024-12-16' },
        { name: 'Sharon E Jones', pct: 15 },
      ],
    },
  }).returning();

  console.log('✅ Created IT CAN BE LLC');

  // Create JEAN ARLENE VENTURING LLC (85% owner of IT CAN BE LLC)
  const [jeanArleneVenturing] = await db.insert(schema.tenants).values({
    name: 'JEAN ARLENE VENTURING LLC',
    slug: 'jean-arlene-venturing',
    type: 'personal',
    parentId: itCanBeLLC.id,
    metadata: {
      description: 'Personal Income Funnel — pass-through to Nick Bianchi 1040',
      jurisdiction: 'Florida',
      formation_date: '2024-12-13',
      filing_number: '500439906755', // FL DOS
      registered_agent: 'Florida Registered Agent LLC',
      // FL Annual Report due May 1, 2026 (auto-pay failed per 2026-02-10 email)
      ownership_percentage: 85,
      properties: [
        '541 W Addison St #3S, Chicago IL 60613',
        '550 W Surf St #504, Chicago IL 60657',
      ],
    },
  }).returning();

  console.log('✅ Created JEAN ARLENE VENTURING LLC');

  // Create ARIBIA LLC (parent series LLC)
  const [aribiaLLC] = await db.insert(schema.tenants).values({
    name: 'ARIBIA LLC',
    slug: 'aribia-llc',
    type: 'series',
    parentId: itCanBeLLC.id,
    taxId: null, // Add actual EIN
    metadata: {
      jurisdiction: 'Illinois',
      description: 'Illinois Series LLC - Property Investment, Improvement, and Management',
      ownership: '100% owned by IT CAN BE LLC',
      // ARIBIA LLC member timeline (verified from ChittyEvidence):
      //   Jul 2022 – Mar 14, 2024: Nick 90%, Luisa 10% (individual members)
      //   Mar 15 – Oct 14, 2024: Nick 85%, Luisa 10%, Sharon 5% (individual members)
      //   Oct 15 – Oct 28, 2024: Nick 85%, Sharon 5% (Luisa removed Oct 14)
      //   Oct 29, 2024 – present: IT CAN BE LLC 100% (Amendment B, sole member)
      // Sources: Member List (2024-03-01), Unanimous Consent Removal (2024-10-14),
      //          Amendment B (2024-10-29), Amendment C (2025-03-08)
      // NOTE: members_2024 is for 2024 K-1 generation (mixed individual + entity periods)
      //        members is current state (2025+)
      members: [
        { name: 'IT CAN BE LLC', pct: 100 },
      ],
      members_2024: [
        { name: 'Nicholas Bianchi', pct: 90, endDate: '2024-03-14' },
        { name: 'Nicholas Bianchi', pct: 85, startDate: '2024-03-15', endDate: '2024-10-28' },
        { name: 'Luisa Arias', pct: 10, endDate: '2024-10-14' },
        { name: 'Sharon E Jones', pct: 5, startDate: '2024-03-15', endDate: '2024-10-28' },
        { name: 'IT CAN BE LLC', pct: 100, startDate: '2024-10-29' },
      ],
    },
  }).returning();

  console.log('✅ Created ARIBIA LLC');

  // Create ARIBIA LLC - MGMT (management series)
  const [aribiaMgmt] = await db.insert(schema.tenants).values({
    name: 'ARIBIA LLC - MGMT',
    slug: 'aribia-mgmt',
    type: 'management',
    parentId: aribiaLLC.id,
    metadata: {
      description: 'Property management, maintenance & marketing',
      brands: [
        {
          name: 'Chicago Furnished Condos',
          purpose: 'Consumer focused brand for discoverability and engagement',
        },
        {
          name: 'Chitty Services',
          purpose: 'Owner/vendor focused services - Maintenance, Asset & Inventory Management, tech/innovation',
        },
      ],
    },
  }).returning();

  console.log('✅ Created ARIBIA LLC - MGMT');

  // Create ARIBIA LLC - CITY STUDIO (property series)
  const [aribiaCityStudio] = await db.insert(schema.tenants).values({
    name: 'ARIBIA LLC - CITY STUDIO',
    slug: 'aribia-city-studio',
    type: 'property',
    parentId: aribiaLLC.id,
    metadata: {
      description: 'Property holding entity',
      ownership: '100% owned by ARIBIA LLC',
    },
  }).returning();

  console.log('✅ Created ARIBIA LLC - CITY STUDIO');

  // Create property record for City Studio
  const [cityStudioProperty] = await db.insert(schema.properties).values({
    tenantId: aribiaCityStudio.id,
    name: 'City Studio',
    address: '550 W Surf St Unit C211',
    city: 'Chicago',
    state: 'IL',
    zip: '60657',
    country: 'USA',
    propertyType: 'condo',
    metadata: {
      managed_by: 'ARIBIA LLC - MGMT',
      brand: 'Chicago Furnished Condos',
    },
  }).returning();

  console.log('✅ Created City Studio property record');

  // Create ARIBIA LLC - APT ARLENE (property series)
  const [aribiaAptArlene] = await db.insert(schema.tenants).values({
    name: 'ARIBIA LLC - APT ARLENE',
    slug: 'aribia-apt-arlene',
    type: 'property',
    parentId: aribiaLLC.id,
    metadata: {
      description: 'Property holding entity',
      ownership: {
        'ARIBIA LLC': '85%',
        'Sharon E Jones': '15%',
      },
      members: [
        { name: 'ARIBIA LLC', pct: 85 },
        { name: 'Sharon E Jones', pct: 15 },
      ],
    },
  }).returning();

  console.log('✅ Created ARIBIA LLC - APT ARLENE');

  // Create property record for Villa Vista
  const [villaVistaProperty] = await db.insert(schema.properties).values({
    tenantId: aribiaAptArlene.id,
    name: 'Villa Vista',
    address: '4343 N Clarendon Unit 1610',
    city: 'Chicago',
    state: 'IL',
    zip: '60613',
    country: 'USA',
    propertyType: 'condo',
    metadata: {
      managed_by: 'ARIBIA LLC - MGMT',
      brand: 'Chicago Furnished Condos',
    },
  }).returning();

  console.log('✅ Created Villa Vista property record');

  // Create Morada Mami property (under ARIBIA LLC directly)
  const [moradaMamiProperty] = await db.insert(schema.properties).values({
    tenantId: aribiaLLC.id,
    name: 'Morada Mami',
    address: 'Carrera 76 A # 53-215',
    city: 'Medellin',
    state: 'ANT',
    zip: '050026',
    country: 'COL',
    propertyType: 'condo',
    metadata: {
      description: 'Colombia property',
    },
  }).returning();

  console.log('✅ Created Morada Mami property record');

  // Create Nicholas Bianchi personal tenant (personally held properties)
  const [nicholasBianchiTenant] = await db.insert(schema.tenants).values({
    name: 'Nicholas Bianchi',
    slug: 'nicholas-bianchi',
    type: 'personal',
    parentId: itCanBeLLC.id,
    metadata: {
      description: 'Personally held real estate assets',
      income_assigned_to: 'JEAN ARLENE VENTURING LLC',
      management_assigned_to: 'JEAN ARLENE VENTURING LLC',
    },
  }).returning();

  console.log('✅ Created Nicholas Bianchi (personal)');

  // Create Lakeside Loft (personally held, income/mgmt via JAV LLC)
  const [lakesideLoftProperty] = await db.insert(schema.properties).values({
    tenantId: nicholasBianchiTenant.id,
    name: 'Lakeside Loft',
    address: '541 W Addison St Unit 3S',
    city: 'Chicago',
    state: 'IL',
    zip: '60613',
    country: 'USA',
    propertyType: 'condo',
    metadata: {
      brand: 'Chicago Furnished Condos',
      income_assigned_to: 'JEAN ARLENE VENTURING LLC',
      management_assigned_to: 'JEAN ARLENE VENTURING LLC',
    },
  }).returning();

  console.log('✅ Created Lakeside Loft property record');

  // Create Cozy Castle (personally held, income/mgmt via JAV LLC)
  const [cozyCastleProperty] = await db.insert(schema.properties).values({
    tenantId: nicholasBianchiTenant.id,
    name: 'Cozy Castle',
    address: '550 W Surf St Unit 504',
    city: 'Chicago',
    state: 'IL',
    zip: '60657',
    country: 'USA',
    propertyType: 'condo',
    metadata: {
      brand: 'Chicago Furnished Condos',
      income_assigned_to: 'JEAN ARLENE VENTURING LLC',
      management_assigned_to: 'JEAN ARLENE VENTURING LLC',
    },
  }).returning();

  console.log('✅ Created Cozy Castle property record');

  // Create placeholder for ChittyCorp LLC (pending formation)
  const [chittyCorp] = await db.insert(schema.tenants).values({
    name: 'ChittyCorp LLC',
    slug: 'chittycorp',
    type: 'holding',
    parentId: itCanBeLLC.id,
    isActive: false, // Not yet formed
    metadata: {
      status: 'pending_formation',
      jurisdiction: 'Wyoming',
      description: 'Tech & IP holding company for ChittyCorp & ChittyFoundation assets',
      planned_ownership: '100% owned by IT CAN BE LLC',
    },
  }).returning();

  console.log('✅ Created ChittyCorp LLC (pending)');

  // Create users with initial passwords (change on first login in production)
  const defaultPassword = process.env.SEED_PASSWORD || 'chittyfinance2026';
  const hashedPw = await hashPassword(defaultPassword);

  const [nicholasBianchi] = await db.insert(schema.users).values({
    email: 'nick@aribia.llc',
    name: 'Nicholas Bianchi',
    role: 'admin',
    passwordHash: hashedPw,
  }).returning();

  console.log('✅ Created user: Nicholas Bianchi');

  const [sharonJones] = await db.insert(schema.users).values({
    email: 'sharon@itcanbe.llc',
    name: 'Sharon E Jones',
    role: 'admin',
    passwordHash: hashedPw,
  }).returning();

  console.log('✅ Created user: Sharon E Jones');

  // Grant Nicholas Bianchi access to all tenants
  const allTenants = [
    itCanBeLLC,
    jeanArleneVenturing,
    aribiaLLC,
    aribiaMgmt,
    aribiaCityStudio,
    aribiaAptArlene,
    chittyCorp,
    nicholasBianchiTenant,
  ];

  for (const tenant of allTenants) {
    await db.insert(schema.tenantUsers).values({
      tenantId: tenant.id,
      userId: nicholasBianchi.id,
      role: 'owner',
      permissions: { full_access: true },
    });
  }

  console.log('✅ Granted Nicholas Bianchi access to all tenants');

  // Grant Sharon E Jones limited access
  const sharonTenants = [
    itCanBeLLC,
    aribiaLLC,
    aribiaAptArlene, // She has 15% ownership
  ];

  for (const tenant of sharonTenants) {
    await db.insert(schema.tenantUsers).values({
      tenantId: tenant.id,
      userId: sharonJones.id,
      role: tenant.slug === 'aribia-apt-arlene' ? 'owner' : 'admin',
      permissions: {
        view_financials: true,
        edit_financials: tenant.slug === 'aribia-apt-arlene',
      },
    });
  }

  console.log('✅ Granted Sharon E Jones access to relevant tenants');

  console.log('\n🎉 IT CAN BE LLC entity structure seeded successfully!');
  console.log('\nTenant Structure:');
  console.log('├── IT CAN BE LLC (holding)');
  console.log('│   ├── JEAN ARLENE VENTURING LLC (personal, 85%)');
  console.log('│   ├── ARIBIA LLC (series, 100%)');
  console.log('│   │   ├── ARIBIA LLC - MGMT (management)');
  console.log('│   │   ├── ARIBIA LLC - CITY STUDIO (property)');
  console.log('│   │   │   └── City Studio — 550 W Surf St C211');
  console.log('│   │   ├── ARIBIA LLC - APT ARLENE (property)');
  console.log('│   │   │   └── Villa Vista — 4343 N Clarendon #1610');
  console.log('│   │   └── Morada Mami — Carrera 76A #53-215, Medellin');
  console.log('│   ├── Nicholas Bianchi (personal)');
  console.log('│   │   ├── Lakeside Loft — 541 W Addison St #3S');
  console.log('│   │   └── Cozy Castle — 550 W Surf St #504');
  console.log('│   └── ChittyCorp LLC (holding, pending)');
  console.log('\nUsers:');
  console.log('├── Nicholas Bianchi (full access, all 8 tenants)');
  console.log('└── Sharon E Jones (limited access: ITCB, ARIBIA, APT ARLENE)');
}

// Run seed if called directly
if (require.main === module) {
  seedItCanBeLLC()
    .then(() => {
      console.log('\n✅ Seeding complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Seeding failed:', error);
      process.exit(1);
    });
}
