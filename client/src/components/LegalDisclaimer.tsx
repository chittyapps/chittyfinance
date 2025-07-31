import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LegalDisclaimer() {
  return (
    <Card className="loan-card border-amber-200 bg-amber-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-800">
          <i className="fas fa-exclamation-triangle"></i>
          Important Legal Notice
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-amber-800 space-y-2">
        <p><strong>We are not a bank.</strong> We do not guarantee loans or act as a financial institution.</p>
        <p><strong>No guarantees.</strong> We provide tools but make no promises about loan outcomes or payment collection.</p>
        <p><strong>Use at your own risk.</strong> All users should carefully review terms and consult an attorney before entering loan agreements.</p>
        <p><strong>Free basic tracking.</strong> Premium features like certified mail, AI-generated notices, and official loan registration require separate payment.</p>
        <p><strong>No warranty on accuracy.</strong> Users are responsible for verifying all information and calculations.</p>
      </CardContent>
    </Card>
  );
}