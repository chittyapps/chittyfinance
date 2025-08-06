import { Response } from "express";
import type { LoanWithRelations, TimelineEventWithUser, Payment, Communication, Document } from "@shared/schema";

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

interface TimelineData {
  loan: LoanWithRelations;
  events: TimelineEventWithUser[];
  payments: Payment[];
  communications: Communication[];
  documents: Document[];
}

export class TimelineExportService {
  
  static filterEventsByTimeRange(
    events: TimelineEventWithUser[], 
    timeRange: "all" | "custom", 
    startDate?: string, 
    endDate?: string
  ): TimelineEventWithUser[] {
    if (timeRange === "all") return events;
    
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    
    return events.filter(event => {
      const eventDate = event.createdAt ? new Date(event.createdAt) : new Date(0);
      return eventDate >= start && eventDate <= end;
    });
  }

  static getEventColor(eventType: string, colorCoding: boolean): string {
    if (!colorCoding) return "#6B7280";
    
    const colorMap: Record<string, string> = {
      loan_created: "#10B981",
      payment_made: "#3B82F6", 
      payment_missed: "#EF4444",
      communication: "#8B5CF6",
      document_added: "#F59E0B",
      rate_changed: "#EC4899",
      terms_amended: "#06B6D4",
      statement_generated: "#84CC16",
      loan_completed: "#10B981",
      dispute_opened: "#DC2626",
      dispute_resolved: "#059669"
    };
    
    return colorMap[eventType] || "#6B7280";
  }

  static generateCourtoomReadyHTML(data: TimelineData, settings: ExportSettings): string {
    const { loan, events } = data;
    const filteredEvents = this.filterEventsByTimeRange(events, settings.timeRange, settings.startDate, settings.endDate);
    const sortedEvents = settings.chronologicalOrder 
      ? filteredEvents.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateA - dateB;
        })
      : filteredEvents.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

    const title = settings.customTitle || `Timeline of Events: Loan Agreement`;
    const subtitle = settings.customSubtitle || `${loan.lender?.firstName} ${loan.lender?.lastName} v. ${loan.borrower?.firstName} ${loan.borrower?.lastName}`;

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            
            body {
                font-family: 'Times New Roman', serif;
                line-height: 1.6;
                color: #1a1a1a;
                background: #ffffff;
                padding: 40px;
                max-width: 1200px;
                margin: 0 auto;
            }
            
            .header {
                text-align: center;
                border-bottom: 3px solid #1a1a1a;
                padding-bottom: 30px;
                margin-bottom: 40px;
            }
            
            .header h1 {
                font-size: 28px;
                font-weight: bold;
                margin-bottom: 10px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            .header h2 {
                font-size: 18px;
                font-weight: normal;
                color: #4a4a4a;
                margin-bottom: 20px;
            }
            
            .case-info {
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                padding: 20px;
                margin-bottom: 40px;
                border-radius: 0;
            }
            
            .case-info h3 {
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 15px;
                text-transform: uppercase;
                border-bottom: 1px solid #ccc;
                padding-bottom: 5px;
            }
            
            .case-details {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
            }
            
            .case-details div {
                font-size: 14px;
            }
            
            .case-details strong {
                display: inline-block;
                width: 140px;
                font-weight: bold;
            }
            
            .timeline {
                position: relative;
                padding-left: 40px;
            }
            
            .timeline::before {
                content: '';
                position: absolute;
                left: 20px;
                top: 0;
                bottom: 0;
                width: 2px;
                background: #1a1a1a;
            }
            
            .timeline-item {
                position: relative;
                margin-bottom: 40px;
                background: #ffffff;
                border: 1px solid #e0e0e0;
                padding: 25px;
                border-radius: 0;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            .timeline-item::before {
                content: '';
                position: absolute;
                left: -29px;
                top: 25px;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: ${settings.colorCoding ? 'var(--event-color)' : '#1a1a1a'};
                border: 3px solid #ffffff;
                box-shadow: 0 0 0 2px #1a1a1a;
            }
            
            .event-header {
                border-bottom: 1px solid #eee;
                padding-bottom: 10px;
                margin-bottom: 15px;
            }
            
            .event-date {
                font-size: 12px;
                font-weight: bold;
                color: #666;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .event-title {
                font-size: 16px;
                font-weight: bold;
                margin: 5px 0;
                text-transform: capitalize;
            }
            
            .event-type {
                display: inline-block;
                background: #f0f0f0;
                padding: 2px 8px;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                border-radius: 0;
                color: #666;
            }
            
            .event-description {
                font-size: 14px;
                line-height: 1.7;
                margin-bottom: 15px;
            }
            
            .evidence-section {
                background: #f9f9f9;
                padding: 15px;
                border-left: 4px solid #1a1a1a;
                margin-top: 15px;
            }
            
            .evidence-title {
                font-size: 12px;
                font-weight: bold;
                text-transform: uppercase;
                margin-bottom: 10px;
                color: #333;
            }
            
            .evidence-list {
                list-style: none;
                padding: 0;
            }
            
            .evidence-list li {
                font-size: 13px;
                margin-bottom: 5px;
                padding-left: 15px;
                position: relative;
            }
            
            .evidence-list li::before {
                content: '•';
                position: absolute;
                left: 0;
                font-weight: bold;
            }
            
            .page-break {
                page-break-before: always;
            }
            
            .footer {
                margin-top: 60px;
                text-align: center;
                font-size: 12px;
                color: #666;
                border-top: 1px solid #ccc;
                padding-top: 20px;
            }
            
            @media print {
                body { padding: 20px; }
                .timeline-item { page-break-inside: avoid; }
                .page-break { page-break-before: always; }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>${title}</h1>
            <h2>${subtitle}</h2>
            <div style="font-size: 14px; color: #666;">
                Generated on ${new Date().toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
            </div>
        </div>
        
        <div class="case-info">
            <h3>Loan Agreement Details</h3>
            <div class="case-details">
                <div>
                    <div><strong>Lender:</strong> ${loan.lender?.firstName || 'N/A'} ${loan.lender?.lastName || 'N/A'}</div>
                    <div><strong>Borrower:</strong> ${loan.borrower?.firstName || 'N/A'} ${loan.borrower?.lastName || 'N/A'}</div>
                    <div><strong>Principal Amount:</strong> $${parseFloat(loan.amount || '0').toLocaleString()}</div>
                    <div><strong>Interest Rate:</strong> ${loan.interestRate || '0'}% ${loan.paymentFrequency || 'monthly'}</div>
                </div>
                <div>
                    <div><strong>Term:</strong> ${loan.termMonths || '0'} months</div>
                    <div><strong>Monthly Payment:</strong> $${parseFloat(loan.monthlyPayment || '0').toLocaleString()}</div>
                    <div><strong>Current Status:</strong> ${(loan.status || 'pending').toUpperCase()}</div>
                    <div><strong>Remaining Balance:</strong> $${parseFloat(loan.remainingBalance || '0').toLocaleString()}</div>
                </div>
            </div>
        </div>
        
        <div class="timeline">
            ${sortedEvents.map((event, index) => {
              const eventDate = event.createdAt ? new Date(event.createdAt) : new Date();
              return `
                <div class="timeline-item" style="--event-color: ${this.getEventColor(event.type, settings.colorCoding)}">
                    <div class="event-header">
                        <div class="event-date">
                            ${eventDate.toLocaleDateString('en-US', { 
                              weekday: 'long',
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                        </div>
                        <div class="event-title">${event.title || 'Untitled Event'}</div>
                        <span class="event-type">${event.type.replace('_', ' ')}</span>
                    </div>
                    
                    ${event.description ? `
                        <div class="event-description">
                            ${event.description}
                        </div>
                    ` : ''}
                    
                    ${settings.showEvidence ? `
                        <div class="evidence-section">
                            <div class="evidence-title">Supporting Evidence</div>
                            <ul class="evidence-list">
                                <li>Timeline Event #${index + 1}</li>
                                <li>Event Type: ${event.type}</li>
                                ${event.createdByUser ? `<li>Created by: ${event.createdByUser.firstName || ''} ${event.createdByUser.lastName || ''}</li>` : ''}
                                ${event.metadata ? `<li>Additional Data: Available</li>` : ''}
                            </ul>
                        </div>
                    ` : ''}
                </div>
              `;
            }).join('')}
        </div>
        
        <div class="footer">
            <p>This timeline was generated electronically and is intended for legal proceedings.</p>
            <p>All dates and times are recorded in the system timezone at the time of the event.</p>
            <p>Total Events: ${sortedEvents.length} | Export Format: ${settings.format.toUpperCase()} | Style: ${settings.style}</p>
        </div>
    </body>
    </html>
    `;
  }

  static generateHTML(data: TimelineData, settings: ExportSettings): string {
    return this.generateCourtoomReadyHTML(data, settings);
  }
}