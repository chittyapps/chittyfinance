// Seed script for IT CAN BE LLC entity structure
// Run this after initializing the database to create the tenant hierarchy

import { db } from '../../server/db';
import * as schema from '../system.schema';

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
      formation_date: '2025-01-01', // Update with actual date
      description: 'Wyoming Closely Held LLC - Parent holding company',
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
      description: 'Personal Income Funnel',
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
    },
  }).returning();

  console.log('✅ Created ARIBIA LLC - APT ARLENE');

  // Create property record for Apt Arlene
  const [aptArleneProperty] = await db.insert(schema.properties).values({
    tenantId: aribiaAptArlene.id,
    name: 'Apartment Arlene',
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

  console.log('✅ Created Apartment Arlene property record');

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

  // Create users
  const [nicholasBianchi] = await db.insert(schema.users).values({
    email: 'nick@aribia.llc',
    name: 'Nicholas Bianchi',
    role: 'admin',
    passwordHash: null, // Will be set on first login
  }).returning();

  console.log('✅ Created user: Nicholas Bianchi');

  const [sharonJones] = await db.insert(schema.users).values({
    email: 'sharon@itcanbe.llc',
    name: 'Sharon E Jones',
    role: 'admin',
    passwordHash: null,
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
  console.log('│   │   │   └── 550 W Surf St C211');
  console.log('│   │   └── ARIBIA LLC - APT ARLENE (property)');
  console.log('│   │       └── 4343 N Clarendon #1610');
  console.log('│   └── ChittyCorp LLC (holding, pending)');
  console.log('\nUsers:');
  console.log('├── Nicholas Bianchi (full access)');
  console.log('└── Sharon E Jones (limited access)');
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
