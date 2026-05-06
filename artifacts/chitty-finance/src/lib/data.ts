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
    title: "A. Marital Estate Summary",
    items: [
      {
        id: "A-01",
        q: "Total Marital Assets (Working Draft)",
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
        q: "Total Marital Liabilities",
        workingFig: "$3,125,450.00",
        targetSources: "Credit Reports, Mortgage Statements",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "A-03",
        q: "Joint Account Balance (Chase x8892)",
        workingFig: "$245,100.50",
        targetSources: "Chase Bank Statement (Dec 2022)",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "A-04",
        q: "Date of Separation / Valuation Cutoff",
        workingFig: "11/14/2022",
        targetSources: "Court Order, Mediated Agreement",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        logicNote: "Check if alternative separation date of 12/01/2022 is supported by filing."
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
        workingFig: "Joint Savings",
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
        workingFig: "Separate Inheritance",
        targetSources: "Wire Confirmation, Trust Documents",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
        logicNote: "Crucial to trace back to separate property trust to exclude from marital estate."
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
        workingFig: "Joint Investment Acct",
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
        q: "Title Holder",
        workingFig: "Petitioner (Sole)",
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
        logicNote: "Alleged cash payments off-books. High scrutiny required."
      }
    ]
  },
  {
    id: "I",
    title: "I. Petitioner Alleged Misconduct",
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
