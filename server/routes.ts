import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth } from "./auth";
import { insertLoanSchema, insertPaymentSchema, insertTimelineEventSchema, insertCommunicationSchema } from "@shared/schema";
import { z } from "zod";
import { statementService, taxCalculationService } from "./statementService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  setupAuth(app);

  // User settings route
  app.put('/api/user/settings', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { creditorTerm, debtorTerm, seasonalTheme } = req.body;

      const updatedUser = await storage.updateUserSettings(userId, {
        creditorTerm,
        debtorTerm,
        seasonalTheme,
      });

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Dashboard routes
  app.get('/api/dashboard/stats', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const stats = await storage.getUserDashboardStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Loan routes
  app.get('/api/loans', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const loans = await storage.getUserLoans(userId);
      res.json(loans);
    } catch (error) {
      console.error("Error fetching loans:", error);
      res.status(500).json({ message: "Failed to fetch loans" });
    }
  });

  app.get('/api/loans/:id', requireAuth, async (req: any, res) => {
    try {
      const loanId = req.params.id;
      const userId = req.user.id;
      const loan = await storage.getLoanById(loanId);
      
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Check if user has access to this loan
      if (loan.lenderId !== userId && loan.borrowerId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(loan);
    } catch (error) {
      console.error("Error fetching loan:", error);
      res.status(500).json({ message: "Failed to fetch loan" });
    }
  });

  app.post('/api/loans', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const loanData = insertLoanSchema.parse({
        ...req.body,
        lenderId: userId,
      });

      const loan = await storage.createLoan(loanData);

      // Create initial timeline event
      await storage.createTimelineEvent({
        loanId: loan.id,
        type: 'loan_created',
        title: 'Loan Agreement Created',
        description: `Loan of $${loan.amount} created with ${loan.termMonths} month term at ${loan.interestRate}% APR`,
        createdBy: userId,
      });

      res.status(201).json(loan);
    } catch (error) {
      console.error("Error creating loan:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid loan data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create loan" });
    }
  });

  app.put('/api/loans/:id', requireAuth, async (req: any, res) => {
    try {
      const loanId = req.params.id;
      const userId = req.user.id;
      
      // Check if user owns this loan
      const existingLoan = await storage.getLoanById(loanId);
      if (!existingLoan || existingLoan.lenderId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updatedLoan = await storage.updateLoan(loanId, req.body);
      res.json(updatedLoan);
    } catch (error) {
      console.error("Error updating loan:", error);
      res.status(500).json({ message: "Failed to update loan" });
    }
  });

  // Payment routes
  app.get('/api/loans/:id/payments', requireAuth, async (req: any, res) => {
    try {
      const loanId = req.params.id;
      const userId = req.user.id;
      
      // Check access to loan
      const loan = await storage.getLoanById(loanId);
      if (!loan || (loan.lenderId !== userId && loan.borrowerId !== userId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const payments = await storage.getLoanPayments(loanId);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.post('/api/payments', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const paymentData = insertPaymentSchema.parse(req.body);

      // Verify user has access to the loan
      const loan = await storage.getLoanById(paymentData.loanId);
      if (!loan || (loan.lenderId !== userId && loan.borrowerId !== userId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const payment = await storage.createPayment(paymentData);

      // Create timeline event for payment
      await storage.createTimelineEvent({
        loanId: paymentData.loanId,
        type: 'payment_made',
        title: 'Payment Received',
        description: `Payment of $${payment.amount} received`,
        createdBy: userId,
        metadata: { paymentId: payment.id },
      });

      res.status(201).json(payment);
    } catch (error) {
      console.error("Error creating payment:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid payment data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create payment" });
    }
  });

  // Timeline routes
  app.get('/api/loans/:id/timeline', requireAuth, async (req: any, res) => {
    try {
      const loanId = req.params.id;
      const userId = req.user.id;
      
      // Check access to loan
      const loan = await storage.getLoanById(loanId);
      if (!loan || (loan.lenderId !== userId && loan.borrowerId !== userId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const timeline = await storage.getLoanTimeline(loanId);
      res.json(timeline);
    } catch (error) {
      console.error("Error fetching timeline:", error);
      res.status(500).json({ message: "Failed to fetch timeline" });
    }
  });

  app.post('/api/timeline-events', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const eventData = insertTimelineEventSchema.parse({
        ...req.body,
        createdBy: userId,
      });

      // Verify user has access to the loan
      const loan = await storage.getLoanById(eventData.loanId);
      if (!loan || (loan.lenderId !== userId && loan.borrowerId !== userId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const event = await storage.createTimelineEvent(eventData);
      res.status(201).json(event);
    } catch (error) {
      console.error("Error creating timeline event:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid event data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create timeline event" });
    }
  });

  // Communication routes
  app.get('/api/loans/:id/communications', requireAuth, async (req: any, res) => {
    try {
      const loanId = req.params.id;
      const userId = req.user.id;
      
      // Check access to loan
      const loan = await storage.getLoanById(loanId);
      if (!loan || (loan.lenderId !== userId && loan.borrowerId !== userId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const communications = await storage.getLoanCommunications(loanId);
      res.json(communications);
    } catch (error) {
      console.error("Error fetching communications:", error);
      res.status(500).json({ message: "Failed to fetch communications" });
    }
  });

  app.post('/api/communications', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const communicationData = insertCommunicationSchema.parse({
        ...req.body,
        senderId: userId,
      });

      // Verify user has access to the loan
      const loan = await storage.getLoanById(communicationData.loanId);
      if (!loan || (loan.lenderId !== userId && loan.borrowerId !== userId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const communication = await storage.createCommunication(communicationData);

      // Create timeline event for communication
      await storage.createTimelineEvent({
        loanId: communicationData.loanId,
        type: 'communication',
        title: 'New Message',
        description: communicationData.subject || 'Message sent',
        createdBy: userId,
        metadata: { communicationId: communication.id },
      });

      res.status(201).json(communication);
    } catch (error) {
      console.error("Error creating communication:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid communication data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create communication" });
    }
  });

  // AI assistance routes (placeholder for future implementation)
  app.post('/api/ai/suggest-rate', requireAuth, async (req: any, res) => {
    try {
      // This would integrate with OpenAI/Anthropic APIs
      // For now, return a simple calculation based on loan amount and term
      const { amount, termMonths, relationship } = req.body;
      
      // Base rate calculation (simplified)
      let suggestedRate = 4.5; // Base rate
      
      if (relationship === 'family') {
        suggestedRate -= 0.5;
      } else if (relationship === 'friend') {
        suggestedRate -= 0.25;
      }

      if (amount > 50000) {
        suggestedRate += 0.5;
      } else if (amount < 5000) {
        suggestedRate -= 0.25;
      }

      res.json({
        suggestedRate: Math.max(0.5, suggestedRate),
        marketRate: 5.2,
        irsRate: 4.8,
        reasoning: "Rate adjusted for personal relationship and loan amount"
      });
    } catch (error) {
      console.error("Error calculating suggested rate:", error);
      res.status(500).json({ message: "Failed to calculate suggested rate" });
    }
  });

  // Statement routes
  app.post('/api/statements/generate/:loanId', requireAuth, async (req: any, res) => {
    try {
      const loanId = req.params.loanId;
      const statement = await statementService.generateStatement(loanId);
      res.json(statement);
    } catch (error) {
      console.error("Error generating statement:", error);
      res.status(500).json({ message: "Failed to generate statement" });
    }
  });

  app.get('/api/statements/:loanId', requireAuth, async (req: any, res) => {
    try {
      const loanId = req.params.loanId;
      const statements = await storage.getLoanStatements(loanId);
      res.json(statements);
    } catch (error) {
      console.error("Error fetching statements:", error);
      res.status(500).json({ message: "Failed to fetch statements" });
    }
  });

  // Bulk statement generation (for admin/cron)
  app.post('/api/statements/generate-all', requireAuth, async (req: any, res) => {
    try {
      await statementService.generateAllStatements();
      res.json({ message: "All statements generated successfully" });
    } catch (error) {
      console.error("Error generating all statements:", error);
      res.status(500).json({ message: "Failed to generate statements" });
    }
  });

  // Tax calculation routes
  app.get('/api/tax/implications/:year?', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const year = req.params.year ? parseInt(req.params.year) : new Date().getFullYear();
      
      const taxImplications = await taxCalculationService.calculateTaxImplications(userId, year);
      res.json(taxImplications);
    } catch (error) {
      console.error("Error calculating tax implications:", error);
      res.status(500).json({ message: "Failed to calculate tax implications" });
    }
  });

  // Document upload and AI processing routes
  app.post("/api/documents/upload", requireAuth, async (req: any, res) => {
    try {
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getDocumentUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting document upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.post("/api/documents/process", requireAuth, async (req: any, res) => {
    try {
      const { documentUrl } = req.body;
      if (!documentUrl) {
        return res.status(400).json({ error: "Document URL is required" });
      }

      const { ObjectStorageService } = await import("./objectStorage");
      const { documentProcessor } = await import("./documentProcessor");
      
      const objectStorageService = new ObjectStorageService();
      
      // Download document content for AI processing
      const documentText = await objectStorageService.getDocumentText(documentUrl);
      
      // Extract loan terms using AI
      const extractedTerms = await documentProcessor.extractLoanTerms(documentText);
      
      // Validate the extracted terms
      const validation = documentProcessor.validateTerms(extractedTerms);
      
      // Calculate missing parameters
      const calculatedTerms = documentProcessor.calculateMissingParameters(extractedTerms);
      
      // Merge extracted and calculated terms
      const finalTerms = { ...extractedTerms, ...calculatedTerms };

      res.json({
        terms: finalTerms,
        validation,
        documentUrl
      });
    } catch (error) {
      console.error("Error processing document:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: `Failed to process document: ${errorMessage}` });
    }
  });

  app.post("/api/loans/create-from-document", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { extractedTerms, documentUrl, borrowerEmail } = req.body;

      if (!extractedTerms || !documentUrl) {
        return res.status(400).json({ error: "Extracted terms and document URL are required" });
      }

      // Find or validate borrower
      let borrower;
      if (borrowerEmail) {
        borrower = await storage.getUserByEmail(borrowerEmail);
        if (!borrower) {
          return res.status(400).json({ error: "Borrower not found. They must register first." });
        }
      }

      // Create loan with AI-extracted data
      const loanData = {
        lenderId: userId,
        borrowerId: borrower?.id || extractedTerms.borrowerId,
        amount: extractedTerms.amount?.toString() || "0",
        interestRate: extractedTerms.interestRate?.toString() || "0",
        termMonths: extractedTerms.termMonths || 12,
        monthlyPayment: extractedTerms.monthlyPayment?.toString() || "0",
        remainingBalance: extractedTerms.amount?.toString() || "0",
        purpose: extractedTerms.purpose || "Personal loan",
        paymentFrequency: extractedTerms.paymentFrequency || "monthly",
        earlyPayoffPenalty: extractedTerms.earlyPayoffPenalty?.toString(),
        earlyPayoffTerms: extractedTerms.earlyPayoffTerms,
        specialTerms: extractedTerms.specialTerms?.join('; '),
        collateralDescription: extractedTerms.collateralDescription,
        documentUrl,
        aiProcessed: true,
        aiExtractedData: extractedTerms,
        startDate: extractedTerms.startDate ? new Date(extractedTerms.startDate) : new Date(),
        endDate: extractedTerms.endDate ? new Date(extractedTerms.endDate) : undefined,
        latePaymentPenalty: extractedTerms.latePaymentPenalty?.toString() || "0",
      };

      const loan = await storage.createLoan(loanData);
      
      // Create timeline event for AI document processing
      await storage.createTimelineEvent({
        loanId: loan.id,
        type: 'document_added',
        description: `Loan terms automatically extracted from uploaded document using AI (${extractedTerms.confidence ? Math.round(extractedTerms.confidence * 100) : 0}% confidence)`,
        amount: extractedTerms.amount?.toString(),
        metadata: {
          documentUrl,
          aiConfidence: extractedTerms.confidence,
          extractedFields: Object.keys(extractedTerms).filter(key => extractedTerms[key as keyof typeof extractedTerms] != null)
        }
      });

      res.status(201).json(loan);
    } catch (error) {
      console.error("Error creating loan from document:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: `Failed to create loan: ${errorMessage}` });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
