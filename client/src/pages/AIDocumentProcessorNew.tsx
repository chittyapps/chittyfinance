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
import { FileText, Brain, AlertTriangle, CheckCircle, Upload, ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
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

interface ProcessedDocument {
  id: string;
  url: string;
  name: string;
  extractedTerms: ExtractedTerms | null;
  validation: ValidationResult | null;
  isProcessing: boolean;
  error?: string;
}

export default function AIDocumentProcessor() {
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const { toast } = useToast();

  // Get upload URL mutation
  const getUploadUrlMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/documents/upload");
      return response.json();
    },
  });

  // Process document mutation
  const processDocumentMutation = useMutation({
    mutationFn: async ({ documentUrl, documentId }: { documentUrl: string; documentId: string }) => {
      const response = await apiRequest("POST", "/api/documents/process", {
        documentUrl,
        borrowerEmail: borrowerEmail || undefined,
      });
      return { ...await response.json(), documentId };
    },
    onSuccess: (data) => {
      setDocuments(prev => prev.map(doc => 
        doc.id === data.documentId 
          ? { 
              ...doc, 
              extractedTerms: data.extractedTerms,
              validation: data.validation,
              isProcessing: false,
              error: undefined
            }
          : doc
      ));
      toast({
        title: "Document processed successfully",
        description: "AI has extracted loan terms from your document.",
      });
    },
    onError: (error, variables) => {
      console.error("Processing error:", error);
      setDocuments(prev => prev.map(doc => 
        doc.id === variables.documentId 
          ? { 
              ...doc, 
              isProcessing: false,
              error: error.message || "Processing failed"
            }
          : doc
      ));
      toast({
        title: "Processing failed",
        description: error.message || "Failed to process document",
        variant: "destructive",
      });
    },
  });

  const handleUploadComplete = (result: UploadResult) => {
    result.successful.forEach((file) => {
      const docId = crypto.randomUUID();
      const newDoc: ProcessedDocument = {
        id: docId,
        url: file.uploadURL || "",
        name: file.name || "Unknown document",
        extractedTerms: null,
        validation: null,
        isProcessing: true,
        error: undefined,
      };
      
      setDocuments(prev => [...prev, newDoc]);
      
      // Start processing immediately
      processDocumentMutation.mutate({
        documentUrl: file.uploadURL || "",
        documentId: docId,
      });
    });
  };

  const removeDocument = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  const processAllDocuments = () => {
    documents.forEach(doc => {
      if (!doc.isProcessing && !doc.extractedTerms && !doc.error) {
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? { ...d, isProcessing: true } : d
        ));
        processDocumentMutation.mutate({
          documentUrl: doc.url,
          documentId: doc.id,
        });
      }
    });
  };

  const createLoanFromDocuments = () => {
    const mergedTerms = documents.reduce((acc, doc) => {
      if (doc.extractedTerms) {
        return {
          ...acc,
          ...doc.extractedTerms,
          // Combine arrays
          specialTerms: [...(acc.specialTerms || []), ...(doc.extractedTerms.specialTerms || [])],
        };
      }
      return acc;
    }, {} as ExtractedTerms);

    // Here you would redirect to loan creation with pre-filled data
    console.log("Creating loan with merged terms:", mergedTerms);
    toast({
      title: "Loan creation",
      description: "This would redirect to loan creation with extracted terms",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-secondary/5 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">AI Document Processor</h1>
              <p className="text-gray-600">Upload loan documents and let AI extract the terms</p>
            </div>
          </div>
          <Brain className="h-8 w-8 text-primary" />
        </div>

        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Set up processing parameters</CardDescription>
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
            </div>
          </CardContent>
        </Card>

        {/* Document Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Documents
            </CardTitle>
            <CardDescription>
              Upload multiple loan documents. AI will process each one and extract terms.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentUploader
              maxNumberOfFiles={10}
              maxFileSize={10485760} // 10MB
              onGetUploadParameters={async () => {
                const data = await getUploadUrlMutation.mutateAsync();
                return {
                  method: "PUT" as const,
                  url: data.uploadURL,
                };
              }}
              onComplete={handleUploadComplete}
              buttonClassName="w-full"
            >
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Documents
              </div>
            </DocumentUploader>
          </CardContent>
        </Card>

        {/* Documents List */}
        {documents.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Processed Documents ({documents.length})</CardTitle>
                  <CardDescription>Review extracted terms from each document</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={processAllDocuments}
                    disabled={processDocumentMutation.isPending}
                    variant="outline"
                    data-testid="button-process-all"
                  >
                    {processDocumentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Process All
                  </Button>
                  <Button 
                    onClick={createLoanFromDocuments}
                    disabled={!documents.some(d => d.extractedTerms)}
                    data-testid="button-create-loan"
                  >
                    Create Loan
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {documents.map((doc) => (
                <Card key={doc.id} className="border-l-4 border-l-primary/20">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <div>
                          <h4 className="font-semibold">{doc.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            {doc.isProcessing && (
                              <Badge variant="secondary" className="flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Processing...
                              </Badge>
                            )}
                            {doc.extractedTerms && (
                              <Badge variant="default" className="flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Processed
                              </Badge>
                            )}
                            {doc.error && (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Error
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDocument(doc.id)}
                        data-testid={`button-remove-${doc.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  
                  {doc.error && (
                    <CardContent className="pt-0">
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{doc.error}</AlertDescription>
                      </Alert>
                    </CardContent>
                  )}

                  {doc.extractedTerms && (
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                        {doc.extractedTerms.amount && (
                          <div>
                            <span className="font-medium">Amount:</span>
                            <span className="ml-2">{formatCurrency(doc.extractedTerms.amount)}</span>
                          </div>
                        )}
                        {doc.extractedTerms.interestRate && (
                          <div>
                            <span className="font-medium">Interest Rate:</span>
                            <span className="ml-2">{doc.extractedTerms.interestRate}%</span>
                          </div>
                        )}
                        {doc.extractedTerms.termMonths && (
                          <div>
                            <span className="font-medium">Term:</span>
                            <span className="ml-2">{doc.extractedTerms.termMonths} months</span>
                          </div>
                        )}
                        {doc.extractedTerms.paymentFrequency && (
                          <div>
                            <span className="font-medium">Payment:</span>
                            <span className="ml-2 capitalize">{doc.extractedTerms.paymentFrequency}</span>
                          </div>
                        )}
                        {doc.extractedTerms.lenderName && (
                          <div>
                            <span className="font-medium">Lender:</span>
                            <span className="ml-2">{doc.extractedTerms.lenderName}</span>
                          </div>
                        )}
                        {doc.extractedTerms.borrowerName && (
                          <div>
                            <span className="font-medium">Borrower:</span>
                            <span className="ml-2">{doc.extractedTerms.borrowerName}</span>
                          </div>
                        )}
                      </div>
                      
                      {doc.extractedTerms.specialTerms && doc.extractedTerms.specialTerms.length > 0 && (
                        <div className="mt-4">
                          <span className="font-medium">Special Terms:</span>
                          <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                            {doc.extractedTerms.specialTerms.map((term, index) => (
                              <li key={index}>{term}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {doc.extractedTerms.confidence && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between text-sm">
                            <span>Extraction Confidence:</span>
                            <span className={`font-medium ${
                              doc.extractedTerms.confidence > 0.8 
                                ? 'text-green-600' 
                                : doc.extractedTerms.confidence > 0.6 
                                ? 'text-yellow-600' 
                                : 'text-red-600'
                            }`}>
                              {Math.round(doc.extractedTerms.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        {documents.length > 0 && documents.some(d => d.extractedTerms) && (
          <Card>
            <CardHeader>
              <CardTitle>Processing Summary</CardTitle>
              <CardDescription>Overview of all processed documents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {documents.filter(d => d.extractedTerms).length}
                  </div>
                  <div className="text-sm text-green-700">Successfully Processed</div>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {documents.filter(d => d.isProcessing).length}
                  </div>
                  <div className="text-sm text-yellow-700">Processing</div>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {documents.filter(d => d.error).length}
                  </div>
                  <div className="text-sm text-red-700">Failed</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}