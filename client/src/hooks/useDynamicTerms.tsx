import { useAuth } from "./useAuth";

export function useDynamicTerms() {
  const { user } = useAuth();

  const terms = {
    creditor: user?.creditorTerm || "Lender",
    debtor: user?.debtorTerm || "Borrower",
    creditorLower: (user?.creditorTerm || "Lender").toLowerCase(),
    debtorLower: (user?.debtorTerm || "Borrower").toLowerCase(),
  };

  // Helper function to get the appropriate term based on user's role in a loan
  const getTermForRole = (userRole: "lender" | "borrower") => {
    return userRole === "lender" ? terms.creditor : terms.debtor;
  };

  const getTermForRoleLower = (userRole: "lender" | "borrower") => {
    return userRole === "lender" ? terms.creditorLower : terms.debtorLower;
  };

  return {
    ...terms,
    getTermForRole,
    getTermForRoleLower,
  };
}