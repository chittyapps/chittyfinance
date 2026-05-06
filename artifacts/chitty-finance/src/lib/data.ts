export type ConfidenceLevel = 'Unverified' | 'Probable' | 'Confirmed';

export interface AuditItem {
  id: string;
  q: string;
  workingFig: string;
  targetSources: string;
  isCritical?: boolean;
  logicNote?: string;

  // User state
  verifiedFig: string;
  confidence: ConfidenceLevel;
  sourceId: string;
  notes: string;
}

export interface Section {
  id: string;
  title: string;
  items: AuditItem[];
}

export const initialData: Section[] = [
  {
    id: "A",
    title: "A. Estate Summary",
    items: [
      {
        id: "A-01",
        q: "Total Assets (Working Draft)",
        workingFig: "$14,250,000.00",
        targetSources: "Master Asset Schedule, Consolidated Brokerage Statements",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
      },
      {
        id: "A-02",
        q: "Total Liabilities",
        workingFig: "$3,125,450.00",
        targetSources: "Credit Reports, Mortgage Statements",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "A-03",
        q: "Primary Operating Account Balance (Chase x8892)",
        workingFig: "$245,100.50",
        targetSources: "Chase Bank Statement (Dec 2022)",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "A-04",
        q: "Valuation Cutoff Date",
        workingFig: "11/14/2022",
        targetSources: "Engagement Letter, Court Order",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        logicNote: "Confirm whether an alternative cutoff of 12/01/2022 is supported by the filing."
      }
    ]
  },
  {
    id: "B",
    title: "B. Property 1 — Cozy Castle (550 W Surf #C-504)",
    items: [
      {
        id: "B-01",
        q: "Purchase Price",
        workingFig: "$850,000.00",
        targetSources: "Closing Statement HUD-1",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "B-02",
        q: "Down Payment Source",
        workingFig: "Operating Account",
        targetSources: "Wire Confirmation, Bank Statements",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "B-03",
        q: "Mortgage Balance at Cutoff",
        workingFig: "$520,340.12",
        targetSources: "USAA Mortgage Statement",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
      },
      {
        id: "B-04",
        q: "Monthly Rental Income",
        workingFig: "$3,500.00",
        targetSources: "Lease Agreement",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "B-05",
        q: "Contested Improvement Costs",
        workingFig: "$45,000.00",
        targetSources: "Contractor Invoices, Cancelled Checks",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        logicNote: "Working draft cites two different improvement figures across exhibits — reconcile."
      }
    ]
  },
  {
    id: "D",
    title: "D. Property 3 — City Studio (550 W Surf #211)",
    items: [
      {
        id: "D-01",
        q: "Purchase Price",
        workingFig: "$320,000.00",
        targetSources: "Closing Statement HUD-1",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "D-02",
        q: "Down Payment Source",
        workingFig: "Trust Distribution",
        targetSources: "Wire Confirmation, Trust Documents",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
        logicNote: "Trace funds to originating trust to establish source-of-funds classification."
      },
      {
        id: "D-03",
        q: "Mortgage Balance at Cutoff",
        workingFig: "$150,000.00",
        targetSources: "Chase Mortgage Statement",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "D-04",
        q: "Monthly Rental Income",
        workingFig: "$2,100.00",
        targetSources: "Lease Agreement",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      }
    ]
  },
  {
    id: "E",
    title: "E. Property 4 — Villa Vista (4343 N Clarendon #1610)",
    items: [
      {
        id: "E-01",
        q: "Purchase Price",
        workingFig: "$1,100,000.00",
        targetSources: "Closing Statement HUD-1",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "E-02",
        q: "Down Payment Source",
        workingFig: "Investment Account",
        targetSources: "Wire Confirmation",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "E-03",
        q: "Mortgage Balance at Cutoff",
        workingFig: "$780,500.00",
        targetSources: "Citi Mortgage Statement",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "E-04",
        q: "Contested Improvement Costs",
        workingFig: "$110,200.00",
        targetSources: "Contractor Invoices",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      }
    ]
  },
  {
    id: "F",
    title: "F. Property 5 — Morada Mami (Medellín)",
    items: [
      {
        id: "F-01",
        q: "Purchase Price (COP)",
        workingFig: "1,200,000,000 COP",
        targetSources: "Escritura Pública",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "F-02",
        q: "USD Equivalent at Purchase",
        workingFig: "$300,000.00",
        targetSources: "Forex Conversion Record",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "F-03",
        q: "Wire Chain",
        workingFig: "Chase -> Bancolombia",
        targetSources: "SWIFT Confirmations",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "F-04",
        q: "Title Holder of Record",
        workingFig: "Subject (Sole)",
        targetSources: "Certificado de Tradición",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
      },
      {
        id: "F-05",
        q: "Contested Cash Payments",
        workingFig: "$50,000.00",
        targetSources: "Withdrawal Slips, Receipts",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        logicNote: "Alleged off-book cash payments. High scrutiny required."
      }
    ]
  },
  {
    id: "I",
    title: "I. Subject Alleged Misconduct",
    items: [
      {
        id: "I-01",
        q: "Undisclosed Transfers Total",
        workingFig: "$125,000.00",
        targetSources: "Forensic Accounting Report",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "I-02",
        q: "Alleged Dissipation Amounts",
        workingFig: "$45,200.00",
        targetSources: "Bank Statements, Credit Card Bills",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
      },
      {
        id: "I-03",
        q: "Dates of Suspect Withdrawals",
        workingFig: "Oct-Dec 2022",
        targetSources: "Bank Statements",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      }
    ]
  }
];
