import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DocumentUploader } from "@/components/DocumentUploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { FileText, Brain, AlertTriangle, CheckCircle, Upload } from "lucide-react";
import type { UploadResult } from "@uppy/core";

interface ExtractedTerms {
  amount?: number;
  interestRate?: number;
  termMonths?: number;
  paymentFrequency?: 'weekly' | 'biweekly' | 'monthly';
  monthlyPayment?: number;
  earlyPayoffPenalty?: number;
  earlyPayoffTerms?: string;
  specialTerms?: string[];
  collateralDescription?: string;
  startDate?: string;
  endDate?: string;
  lenderName?: string;
  borrowerName?: string;
  purpose?: string;
  latePaymentPenalty?: number;
  confidence?: number;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export default function AIDocumentProcessor() {
  const [documentUrl, setDocumentUrl] = useState<string>("");
  const [extractedTerms, setExtractedTerms] = useState<ExtractedTerms | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Get upload URL mutation
  const getUploadUrlMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/documents/upload");
      return response.json();
    },
  });

  // Process document mutation
  const processDocumentMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/documents/process", { documentUrl: url });
      return response.json();
    },
    onSuccess: (data) => {
      setExtractedTerms(data.terms);
      setValidation(data.validation);
      setIsProcessing(false);
    },
    onError: () => {
      setIsProcessing(false);
    },
  });

  // Create loan from document mutation
  const createLoanMutation = useMutation({
    mutationFn: async (data: { extractedTerms: ExtractedTerms; documentUrl: string; borrowerEmail?: string }) => {
      const response = await apiRequest("POST", "/api/loans/create-from-document", data);
      return response.json();
    },
  });

  const handleGetUploadParameters = async () => {
    const result = await getUploadUrlMutation.mutateAsync();
    return {
      method: "PUT" as const,
      url: result.uploadURL,
    };
  };

  const handleUploadComplete = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful.length > 0) {
      const uploadedFile = result.successful[0];
      const url = uploadedFile.uploadURL as string;
      setDocumentUrl(url);
      setIsProcessing(true);
      processDocumentMutation.mutate(url);
    }
  };

  const handleCreateLoan = () => {
    if (!extractedTerms || !documentUrl) return;
    
    createLoanMutation.mutate({
      extractedTerms,
      documentUrl,
      borrowerEmail: borrowerEmail || undefined,
    });
  };

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'weekly': return 'Weekly';
      case 'biweekly': return 'Bi-weekly';
      case 'monthly': return 'Monthly';
      default: return frequency;
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">AI-Powered Document Processing</h1>
        <p className="text-muted-foreground">
          Upload loan documents and let AI automatically extract and populate loan terms including payment frequencies, 
          early payoff penalties, and special requirements.
        </p>
      </div>

      {/* Upload Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Loan Document
          </CardTitle>
          <CardDescription>
            Supported formats: PDF, DOC, DOCX, TXT, RTF (up to 25MB)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentUploader
            onGetUploadParameters={handleGetUploadParameters}
            onComplete={handleUploadComplete}
            buttonClassName="w-full"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Choose Document to Upload
            </div>
          </DocumentUploader>
          
          {isProcessing && (
            <Alert className="mt-4">
              <Brain className="h-4 w-4" />
              <AlertDescription>
                AI is processing your document and extracting loan terms...
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Processing Results */}
      {extractedTerms && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Extracted Loan Terms
              {extractedTerms.confidence && (
                <Badge variant={extractedTerms.confidence > 0.8 ? "default" : "secondary"}>
                  {Math.round(extractedTerms.confidence * 100)}% Confidence
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Review the automatically extracted terms before creating the loan
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic Terms */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Loan Amount</Label>
                <p className="text-lg font-semibold">
                  {extractedTerms.amount ? formatCurrency(extractedTerms.amount) : 'Not specified'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Interest Rate</Label>
                <p className="text-lg font-semibold">
                  {extractedTerms.interestRate ? `${extractedTerms.interestRate}%` : 'Not specified'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Term</Label>
                <p className="text-lg font-semibold">
                  {extractedTerms.termMonths ? `${extractedTerms.termMonths} months` : 'Not specified'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Payment Frequency</Label>
                <p className="text-lg font-semibold">
                  {extractedTerms.paymentFrequency ? getFrequencyLabel(extractedTerms.paymentFrequency) : 'Monthly'}
                </p>
              </div>
              {extractedTerms.monthlyPayment && (
                <div>
                  <Label className="text-sm font-medium">Payment Amount</Label>
                  <p className="text-lg font-semibold">
                    {formatCurrency(extractedTerms.monthlyPayment)}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Advanced Terms */}
            {(extractedTerms.earlyPayoffPenalty || extractedTerms.earlyPayoffTerms) && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Early Payoff Terms</Label>
                {extractedTerms.earlyPayoffPenalty && (
                  <p className="text-sm">
                    <strong>Penalty:</strong> {extractedTerms.earlyPayoffPenalty}%
                  </p>
                )}
                {extractedTerms.earlyPayoffTerms && (
                  <p className="text-sm text-muted-foreground">
                    {extractedTerms.earlyPayoffTerms}
                  </p>
                )}
              </div>
            )}

            {extractedTerms.specialTerms && extractedTerms.specialTerms.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Special Terms</Label>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  {extractedTerms.specialTerms.map((term, index) => (
                    <li key={index}>{term}</li>
                  ))}
                </ul>
              </div>
            )}

            {extractedTerms.collateralDescription && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Collateral</Label>
                <p className="text-sm text-muted-foreground">
                  {extractedTerms.collateralDescription}
                </p>
              </div>
            )}

            {/* Parties */}
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {extractedTerms.lenderName && (
                <div>
                  <Label className="text-sm font-medium">Lender</Label>
                  <p className="text-sm">{extractedTerms.lenderName}</p>
                </div>
              )}
              {extractedTerms.borrowerName && (
                <div>
                  <Label className="text-sm font-medium">Borrower</Label>
                  <p className="text-sm">{extractedTerms.borrowerName}</p>
                </div>
              )}
            </div>

            {extractedTerms.purpose && (
              <div>
                <Label className="text-sm font-medium">Loan Purpose</Label>
                <p className="text-sm text-muted-foreground">{extractedTerms.purpose}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Validation Results */}
      {validation && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {validation.isValid ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-500" />
              )}
              Validation Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {validation.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-medium">Errors that must be fixed:</p>
                    <ul className="list-disc list-inside text-sm">
                      {validation.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {validation.warnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-medium">Warnings to review:</p>
                    <ul className="list-disc list-inside text-sm">
                      {validation.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {validation.isValid && validation.errors.length === 0 && validation.warnings.length === 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  All extracted terms look good! Ready to create the loan.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Loan Section */}
      {extractedTerms && validation?.isValid && (
        <Card>
          <CardHeader>
            <CardTitle>Create Loan from Document</CardTitle>
            <CardDescription>
              Finalize the loan creation with the AI-extracted terms
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="borrowerEmail">Borrower Email (Optional)</Label>
              <Input
                id="borrowerEmail"
                type="email"
                placeholder="borrower@example.com"
                value={borrowerEmail}
                onChange={(e) => setBorrowerEmail(e.target.value)}
                data-testid="input-borrower-email"
              />
              <p className="text-sm text-muted-foreground mt-1">
                If provided, the system will link this loan to an existing user account
              </p>
            </div>

            <Button
              onClick={handleCreateLoan}
              disabled={createLoanMutation.isPending}
              className="w-full"
              data-testid="button-create-loan"
            >
              {createLoanMutation.isPending ? "Creating Loan..." : "Create Loan from Document"}
            </Button>

            {createLoanMutation.isSuccess && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Loan created successfully! The extracted terms have been automatically populated 
                  and a timeline event has been added documenting the AI processing.
                </AlertDescription>
              </Alert>
            )}

            {createLoanMutation.isError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Failed to create loan. Please check all required fields and try again.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Legal Disclaimer */}
      <Alert className="mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <p className="font-medium mb-2">AI Processing Disclaimer</p>
          <p className="text-sm text-muted-foreground">
            While our AI system is highly accurate, please review all extracted terms carefully before finalizing your loan. 
            Close Lender is not responsible for any errors in AI extraction. For complex legal documents, 
            consider consulting with an attorney.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}