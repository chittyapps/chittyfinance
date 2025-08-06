import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Download, FileText, Calendar, Scale, Eye, Settings, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LoanWithRelations, TimelineEventWithUser } from "@shared/schema";

interface ExportSettings {
  format: "pdf" | "powerpoint" | "html";
  style: "minimal" | "professional" | "courtroom";
  includeDocuments: boolean;
  includeCommunications: boolean;
  includePaymentHistory: boolean;
  customTitle: string;
  customSubtitle: string;
  timeRange: "all" | "custom";
  startDate: string;
  endDate: string;
  chronologicalOrder: boolean;
  showEvidence: boolean;
  colorCoding: boolean;
}

export default function TimelineExport() {
  const { toast } = useToast();
  const [selectedLoanId, setSelectedLoanId] = useState<string>("");
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: "pdf",
    style: "professional",
    includeDocuments: true,
    includeCommunications: true,
    includePaymentHistory: true,
    customTitle: "",
    customSubtitle: "",
    timeRange: "all",
    startDate: "",
    endDate: "",
    chronologicalOrder: true,
    showEvidence: true,
    colorCoding: true,
  });

  // Fetch user's loans
  const { data: loans = [], isLoading: loansLoading } = useQuery<LoanWithRelations[]>({
    queryKey: ["/api/loans"],
  });

  // Fetch timeline events for selected loan
  const { data: timelineEvents = [], isLoading: timelineLoading } = useQuery<TimelineEventWithUser[]>({
    queryKey: ["/api/timeline", selectedLoanId],
    enabled: !!selectedLoanId,
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async (settings: ExportSettings & { loanId: string }) => {
      const response = await apiRequest("POST", "/api/timeline/export", settings);
      return response.blob();
    },
    onSuccess: async (blob, variables) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `timeline-export-${variables.loanId}.${variables.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export Complete",
        description: "Timeline has been exported successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async (settings: ExportSettings & { loanId: string }) => {
      const response = await apiRequest("POST", "/api/timeline/preview", settings);
      return response.json();
    },
    onSuccess: (previewData) => {
      // Open preview in new window
      const previewWindow = window.open("", "_blank", "width=1200,height=800");
      if (previewWindow) {
        previewWindow.document.write(previewData.html);
        previewWindow.document.close();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Preview Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleExport = () => {
    if (!selectedLoanId) {
      toast({
        title: "No Loan Selected",
        description: "Please select a loan to export its timeline",
        variant: "destructive",
      });
      return;
    }

    exportMutation.mutate({ ...exportSettings, loanId: selectedLoanId });
  };

  const handlePreview = () => {
    if (!selectedLoanId) {
      toast({
        title: "No Loan Selected",
        description: "Please select a loan to preview its timeline",
        variant: "destructive",
      });
      return;
    }

    previewMutation.mutate({ ...exportSettings, loanId: selectedLoanId });
  };

  const selectedLoan = loans.find(loan => loan.id === selectedLoanId);

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="timeline-export-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/dashboard">
            <Button variant="outline" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Legal Timeline Export</h1>
            <p className="text-gray-600 dark:text-gray-400">Create professional courtroom-ready timeline presentations</p>
          </div>
        </div>
        <Scale className="h-8 w-8 text-blue-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Loan Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5" />
              <span>Select Loan</span>
            </CardTitle>
            <CardDescription>Choose the loan to export timeline for</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="loan-select">Loan</Label>
              <Select value={selectedLoanId} onValueChange={setSelectedLoanId}>
                <SelectTrigger data-testid="select-loan">
                  <SelectValue placeholder="Select a loan" />
                </SelectTrigger>
                <SelectContent>
                  {loans.map((loan) => (
                    <SelectItem key={loan.id} value={loan.id}>
                      {loan.lender?.firstName} {loan.lender?.lastName} → {loan.borrower?.firstName} {loan.borrower?.lastName} 
                      <span className="text-gray-500 ml-2">${loan.amount}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedLoan && (
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-2" data-testid="loan-summary">
                <h3 className="font-semibold">Loan Summary</h3>
                <p className="text-sm"><strong>Amount:</strong> ${selectedLoan.amount}</p>
                <p className="text-sm"><strong>Rate:</strong> {selectedLoan.interestRate}%</p>
                <p className="text-sm"><strong>Term:</strong> {selectedLoan.termMonths} months</p>
                <p className="text-sm"><strong>Status:</strong> {selectedLoan.status}</p>
                <p className="text-sm"><strong>Events:</strong> {timelineEvents.length}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Export Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Settings className="h-5 w-5" />
              <span>Export Settings</span>
            </CardTitle>
            <CardDescription>Configure your timeline export</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="format">Export Format</Label>
              <Select value={exportSettings.format} onValueChange={(value: "pdf" | "powerpoint" | "html") => 
                setExportSettings(prev => ({ ...prev, format: value }))}>
                <SelectTrigger data-testid="select-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF Document</SelectItem>
                  <SelectItem value="powerpoint">PowerPoint Presentation</SelectItem>
                  <SelectItem value="html">Interactive HTML</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="style">Presentation Style</Label>
              <Select value={exportSettings.style} onValueChange={(value: "minimal" | "professional" | "courtroom") => 
                setExportSettings(prev => ({ ...prev, style: value }))}>
                <SelectTrigger data-testid="select-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minimal">Minimal</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="courtroom">Courtroom Ready</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="custom-title">Custom Title</Label>
              <Input
                id="custom-title"
                value={exportSettings.customTitle}
                onChange={(e) => setExportSettings(prev => ({ ...prev, customTitle: e.target.value }))}
                placeholder="Timeline of Loan Events"
                data-testid="input-title"
              />
            </div>

            <div>
              <Label htmlFor="custom-subtitle">Custom Subtitle</Label>
              <Input
                id="custom-subtitle"
                value={exportSettings.customSubtitle}
                onChange={(e) => setExportSettings(prev => ({ ...prev, customSubtitle: e.target.value }))}
                placeholder="Case Reference or Additional Info"
                data-testid="input-subtitle"
              />
            </div>
          </CardContent>
        </Card>

        {/* Content Options */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Content Options</span>
            </CardTitle>
            <CardDescription>Choose what to include in the timeline</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-documents"
                  checked={exportSettings.includeDocuments}
                  onCheckedChange={(checked) => 
                    setExportSettings(prev => ({ ...prev, includeDocuments: !!checked }))}
                  data-testid="checkbox-documents"
                />
                <Label htmlFor="include-documents">Include Documents</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-communications"
                  checked={exportSettings.includeCommunications}
                  onCheckedChange={(checked) => 
                    setExportSettings(prev => ({ ...prev, includeCommunications: !!checked }))}
                  data-testid="checkbox-communications"
                />
                <Label htmlFor="include-communications">Include Communications</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-payments"
                  checked={exportSettings.includePaymentHistory}
                  onCheckedChange={(checked) => 
                    setExportSettings(prev => ({ ...prev, includePaymentHistory: !!checked }))}
                  data-testid="checkbox-payments"
                />
                <Label htmlFor="include-payments">Include Payment History</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-evidence"
                  checked={exportSettings.showEvidence}
                  onCheckedChange={(checked) => 
                    setExportSettings(prev => ({ ...prev, showEvidence: !!checked }))}
                  data-testid="checkbox-evidence"
                />
                <Label htmlFor="show-evidence">Show Evidence References</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="color-coding"
                  checked={exportSettings.colorCoding}
                  onCheckedChange={(checked) => 
                    setExportSettings(prev => ({ ...prev, colorCoding: !!checked }))}
                  data-testid="checkbox-color"
                />
                <Label htmlFor="color-coding">Color Coding by Event Type</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="chronological"
                  checked={exportSettings.chronologicalOrder}
                  onCheckedChange={(checked) => 
                    setExportSettings(prev => ({ ...prev, chronologicalOrder: !!checked }))}
                  data-testid="checkbox-chronological"
                />
                <Label htmlFor="chronological">Chronological Order</Label>
              </div>
            </div>

            <div>
              <Label htmlFor="time-range">Time Range</Label>
              <Select value={exportSettings.timeRange} onValueChange={(value: "all" | "custom") => 
                setExportSettings(prev => ({ ...prev, timeRange: value }))}>
                <SelectTrigger data-testid="select-timerange">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="custom">Custom Date Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {exportSettings.timeRange === "custom" && (
              <div className="space-y-2" data-testid="custom-date-range">
                <div>
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={exportSettings.startDate}
                    onChange={(e) => setExportSettings(prev => ({ ...prev, startDate: e.target.value }))}
                    data-testid="input-start-date"
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={exportSettings.endDate}
                    onChange={(e) => setExportSettings(prev => ({ ...prev, endDate: e.target.value }))}
                    data-testid="input-end-date"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center space-x-4">
        <Button
          onClick={handlePreview}
          variant="outline"
          disabled={!selectedLoanId || previewMutation.isPending}
          data-testid="button-preview"
        >
          <Eye className="h-4 w-4 mr-2" />
          {previewMutation.isPending ? "Generating Preview..." : "Preview Timeline"}
        </Button>

        <Button
          onClick={handleExport}
          disabled={!selectedLoanId || exportMutation.isPending}
          data-testid="button-export"
        >
          <Download className="h-4 w-4 mr-2" />
          {exportMutation.isPending ? "Exporting..." : "Export Timeline"}
        </Button>
      </div>

      {/* Export Formats Info */}
      <Card>
        <CardHeader>
          <CardTitle>Export Format Details</CardTitle>
          <CardDescription>Understanding the different export options</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold text-blue-600">PDF Document</h3>
              <p className="text-sm text-gray-600 mt-2">
                Static document perfect for printing and formal submissions. Includes all timeline events with proper legal formatting.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold text-green-600">PowerPoint Presentation</h3>
              <p className="text-sm text-gray-600 mt-2">
                Interactive slides for courtroom presentations. Each major event gets its own slide with supporting evidence.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold text-purple-600">Interactive HTML</h3>
              <p className="text-sm text-gray-600 mt-2">
                Web-based timeline with zoom, filtering, and interactive elements. Perfect for digital case management.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}