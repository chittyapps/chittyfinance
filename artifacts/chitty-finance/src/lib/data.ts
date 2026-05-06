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

// Audit thesis:
// All five properties are NON-MARITAL. Each must trace back to premarital
// or separate (gift / inheritance / pre-DOM account) funding without
// commingling. Items below are written as that working position; the
// auditor's job is to verify each premarital trace against primary sources.
export const initialData: Section[] = [
  {
    id: "A",
    title: "A. Classification Summary (Non-Marital Position)",
    items: [
      {
        id: "A-01",
        q: "Date of Marriage (DOM)",
        workingFig: "06/22/2018",
        targetSources: "Marriage Certificate",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
        logicNote: "All premarital tracing depends on this date. Confirm before evaluating any property."
      },
      {
        id: "A-02",
        q: "Properties Asserted as Non-Marital",
        workingFig: "5 of 5",
        targetSources: "Property Schedule, Deeds, Trust Records",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
      },
      {
        id: "A-03",
        q: "Premarital Source-of-Funds Account (Pre-DOM)",
        workingFig: "Schwab x4471 — opened 03/2014",
        targetSources: "Schwab Statements 03/2014 – 06/2018",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "A-04",
        q: "Inheritance Corpus (Separate Property)",
        workingFig: "$2,400,000.00",
        targetSources: "Probate Order, Trustee Distribution Letter",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "A-05",
        q: "Commingling Events Identified",
        workingFig: "0",
        targetSources: "Full Account Reconciliation, Forensic Walkback",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        logicNote: "Any deposit of marital wages into a source account collapses the non-marital trace. Re-test after each property review."
      }
    ]
  },
  {
    id: "B",
    title: "B. Property 1 — Cozy Castle (550 W Surf #C-504)",
    items: [
      {
        id: "B-01",
        q: "Acquisition Date (Pre-DOM)",
        workingFig: "11/14/2015",
        targetSources: "Recorded Deed, Closing Statement HUD-1",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
        logicNote: "Acquired ~2.5 years before DOM — non-marital on its face if no post-DOM commingling."
      },
      {
        id: "B-02",
        q: "Purchase Price",
        workingFig: "$850,000.00",
        targetSources: "Closing Statement HUD-1",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "B-03",
        q: "Down Payment Source (Premarital)",
        workingFig: "$237,500.00 from Schwab x4471",
        targetSources: "Wire Confirmation #USAA-9921, Schwab Statement 10/2015",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
      },
      {
        id: "B-04",
        q: "Mortgage Origination — Sole Borrower",
        workingFig: "Sole — Subject only",
        targetSources: "Note, Deed of Trust",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "B-05",
        q: "Post-DOM Mortgage Payments — Source",
        workingFig: "Rental income (segregated acct)",
        targetSources: "Chase x2210 statements (rental escrow)",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        logicNote: "If any post-DOM payment came from a joint or wage account, a marital reimbursement claim attaches."
      },
      {
        id: "B-06",
        q: "Improvements During Marriage",
        workingFig: "$0.00",
        targetSources: "Contractor Invoices, Cancelled Checks",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      }
    ]
  },
  {
    id: "D",
    title: "D. Property 3 — City Studio (550 W Surf #211)",
    items: [
      {
        id: "D-01",
        q: "Acquisition Date (Pre-DOM)",
        workingFig: "08/03/2016",
        targetSources: "Recorded Deed, Closing Statement HUD-1",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
      },
      {
        id: "D-02",
        q: "Purchase Price",
        workingFig: "$320,000.00",
        targetSources: "Closing Statement HUD-1",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "D-03",
        q: "Down Payment Source (Premarital Inheritance)",
        workingFig: "$96,000.00 from Trustee Distribution",
        targetSources: "Trustee Letter 07/2016, Wire #BOA-3318",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
        logicNote: "Trace inheritance distribution → Schwab x4471 → escrow without intermediate joint account."
      },
      {
        id: "D-04",
        q: "Title — Sole Owner",
        workingFig: "Subject (Sole)",
        targetSources: "Recorded Deed",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "D-05",
        q: "Post-DOM Mortgage Payments — Source",
        workingFig: "Rental income (segregated acct)",
        targetSources: "Chase x2210 statements",
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
        q: "Acquisition Date (Pre-DOM)",
        workingFig: "02/27/2017",
        targetSources: "Recorded Deed, Closing Statement HUD-1",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
      },
      {
        id: "E-02",
        q: "Purchase Price",
        workingFig: "$1,100,000.00",
        targetSources: "Closing Statement HUD-1",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "E-03",
        q: "Down Payment Source (Premarital Investment)",
        workingFig: "$275,000.00 from Schwab x4471",
        targetSources: "Schwab Statement 01/2017, Wire #CITI-7741",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "E-04",
        q: "Title — Sole Owner",
        workingFig: "Subject (Sole)",
        targetSources: "Recorded Deed",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "E-05",
        q: "Improvements During Marriage — Reimbursable?",
        workingFig: "$110,200.00",
        targetSources: "Contractor Invoices, Source Account Statements",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        logicNote: "Property is non-marital, but improvements paid from marital funds may create a reimbursement claim. Verify funding source."
      }
    ]
  },
  {
    id: "F",
    title: "F. Property 5 — Morada Mami (Medellín)",
    items: [
      {
        id: "F-01",
        q: "Acquisition Date (Pre-DOM)",
        workingFig: "05/10/2017",
        targetSources: "Escritura Pública, Certificado de Tradición",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
      },
      {
        id: "F-02",
        q: "Purchase Price (COP)",
        workingFig: "1,200,000,000 COP",
        targetSources: "Escritura Pública",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "F-03",
        q: "USD Equivalent at Purchase",
        workingFig: "$300,000.00",
        targetSources: "Forex Conversion Record, SWIFT",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "F-04",
        q: "Premarital Wire Chain",
        workingFig: "Schwab x4471 -> Chase x4012 -> Bancolombia",
        targetSources: "SWIFT Confirmations, Chase x4012 (pre-DOM segregated)",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
        logicNote: "Confirm Chase x4012 had zero marital deposits before the outbound wire — any commingling in the corridor breaks the trace."
      },
      {
        id: "F-05",
        q: "Title Holder of Record",
        workingFig: "Subject (Sole)",
        targetSources: "Certificado de Tradición",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "F-06",
        q: "Post-DOM Cash Contributions Alleged",
        workingFig: "$0.00",
        targetSources: "Withdrawal Slips, Receipts, Bank Statements",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        logicNote: "Opposing party alleges off-book cash payments after DOM. Disprove or quantify."
      }
    ]
  },
  {
    id: "I",
    title: "I. Opposing Party Allegations",
    items: [
      {
        id: "I-01",
        q: "Alleged Commingling Events",
        workingFig: "0 substantiated",
        targetSources: "Full Account Reconciliation",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
        isCritical: true,
      },
      {
        id: "I-02",
        q: "Alleged Marital-Fund Improvements (Reimbursement Claim)",
        workingFig: "$45,200.00",
        targetSources: "Bank Statements, Credit Card Bills, Contractor Invoices",
        verifiedFig: "",
        confidence: "Unverified",
        sourceId: "",
        notes: "",
      },
      {
        id: "I-03",
        q: "Dates of Allegedly Commingled Activity",
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
