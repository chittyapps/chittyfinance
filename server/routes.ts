import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertLoanSchema, insertPaymentSchema, insertTimelineEventSchema, insertCommunicationSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Dashboard routes
  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getUserDashboardStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Loan routes
  app.get('/api/loans', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const loans = await storage.getUserLoans(userId);
      res.json(loans);
    } catch (error) {
      console.error("Error fetching loans:", error);
      res.status(500).json({ message: "Failed to fetch loans" });
    }
  });

  app.get('/api/loans/:id', isAuthenticated, async (req: any, res) => {
    try {
      const loanId = req.params.id;
      const userId = req.user.claims.sub;
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

  app.post('/api/loans', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  app.put('/api/loans/:id', isAuthenticated, async (req: any, res) => {
    try {
      const loanId = req.params.id;
      const userId = req.user.claims.sub;
      
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
  app.get('/api/loans/:id/payments', isAuthenticated, async (req: any, res) => {
    try {
      const loanId = req.params.id;
      const userId = req.user.claims.sub;
      
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

  app.post('/api/payments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.get('/api/loans/:id/timeline', isAuthenticated, async (req: any, res) => {
    try {
      const loanId = req.params.id;
      const userId = req.user.claims.sub;
      
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

  app.post('/api/timeline-events', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.get('/api/loans/:id/communications', isAuthenticated, async (req: any, res) => {
    try {
      const loanId = req.params.id;
      const userId = req.user.claims.sub;
      
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

  app.post('/api/communications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.post('/api/ai/suggest-rate', isAuthenticated, async (req: any, res) => {
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

  const httpServer = createServer(app);
  return httpServer;
}
