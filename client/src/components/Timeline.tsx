import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TimelineEventWithUser } from "@shared/schema";

interface TimelineProps {
  loanId: string;
}

export default function Timeline({ loanId }: TimelineProps) {
  const { data: timeline, isLoading, error } = useQuery<TimelineEventWithUser[]>({
    queryKey: ["/api/loans", loanId, "timeline"],
    retry: false,
  });

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'loan_created':
        return 'fa-handshake';
      case 'payment_made':
        return 'fa-dollar-sign';
      case 'payment_missed':
        return 'fa-exclamation-triangle';
      case 'communication':
        return 'fa-comment-dots';
      case 'document_added':
        return 'fa-file-alt';
      case 'rate_changed':
        return 'fa-percentage';
      case 'terms_amended':
        return 'fa-file-signature';
      case 'loan_completed':
        return 'fa-check-circle';
      case 'dispute_opened':
        return 'fa-gavel';
      case 'dispute_resolved':
        return 'fa-handshake';
      default:
        return 'fa-circle';
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'loan_created':
        return 'from-primary to-blue-400';
      case 'payment_made':
        return 'from-secondary to-emerald-400';
      case 'payment_missed':
        return 'from-red-500 to-red-400';
      case 'communication':
        return 'from-accent to-purple-400';
      case 'document_added':
        return 'from-orange-500 to-yellow-400';
      case 'rate_changed':
        return 'from-pink-500 to-rose-400';
      case 'terms_amended':
        return 'from-indigo-500 to-purple-400';
      case 'loan_completed':
        return 'from-emerald-500 to-green-400';
      case 'dispute_opened':
        return 'from-red-600 to-red-500';
      case 'dispute_resolved':
        return 'from-green-600 to-emerald-500';
      default:
        return 'from-neutral-400 to-neutral-300';
    }
  };

  const formatEventDate = (date: string | Date | null) => {
    if (!date) return 'Unknown date';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <Card className="loan-card">
        <CardContent className="p-8">
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-start space-x-6 animate-pulse">
                <div className="w-16 h-16 bg-neutral-200 rounded-full"></div>
                <div className="flex-1 max-w-2xl">
                  <div className="h-4 bg-neutral-200 rounded mb-2"></div>
                  <div className="h-3 bg-neutral-200 rounded w-2/3 mb-2"></div>
                  <div className="h-3 bg-neutral-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="loan-card">
        <CardContent className="p-8 text-center">
          <i className="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
          <p className="text-neutral-600">Failed to load timeline</p>
        </CardContent>
      </Card>
    );
  }

  if (!timeline || timeline.length === 0) {
    return (
      <Card className="loan-card">
        <CardContent className="p-8 text-center">
          <i className="fas fa-clock text-4xl text-neutral-400 mb-4"></i>
          <p className="text-neutral-600">No timeline events yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {/* Timeline Controls */}
      <Card className="loan-card mb-8">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <Button 
                size="sm"
                className="bg-primary text-white"
              >
                <i className="fas fa-filter mr-2"></i>All Events
              </Button>
              <Button 
                variant="ghost"
                size="sm"
                className="text-neutral-600 hover:text-primary"
              >
                Payments
              </Button>
              <Button 
                variant="ghost"
                size="sm"
                className="text-neutral-600 hover:text-primary"
              >
                Documents
              </Button>
              <Button 
                variant="ghost"
                size="sm"
                className="text-neutral-600 hover:text-primary"
              >
                Communications
              </Button>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm">
                <i className="fas fa-search-minus"></i>
              </Button>
              <Button variant="ghost" size="sm">
                <i className="fas fa-search-plus"></i>
              </Button>
              <Button variant="ghost" size="sm">
                <i className="fas fa-download"></i>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Events */}
      <div className="relative">
        {/* Timeline Line */}
        <div className="absolute left-8 top-0 bottom-0 w-1 timeline-line rounded-full"></div>
        
        {/* Timeline Events */}
        <div className="space-y-8">
          {timeline.map((event) => (
            <div key={event.id} className="relative flex items-start space-x-6">
              <div className={`relative z-10 w-16 h-16 bg-gradient-to-r ${getEventColor(event.type)} rounded-full flex items-center justify-center shadow-lg`}>
                <i className={`fas ${getEventIcon(event.type)} text-white text-xl`}></i>
              </div>
              <Card className="loan-card flex-1 max-w-2xl">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-bold text-neutral-800">{event.title}</h4>
                    <span className="text-sm text-neutral-500">
                      {formatEventDate(event.createdAt)}
                    </span>
                  </div>
                  <p className="text-neutral-600 mb-4">{event.description}</p>
                  
                  {event.type === 'payment_made' && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                      <p className="text-emerald-700 text-sm">
                        <i className="fas fa-check-circle mr-2"></i>
                        Payment processed successfully
                      </p>
                    </div>
                  )}

                  {event.type === 'communication' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                      <p className="text-blue-700 text-sm">
                        <i className="fas fa-comment mr-2"></i>
                        New message in conversation
                      </p>
                    </div>
                  )}

                  <div className="flex items-center space-x-4">
                    <Button 
                      variant="ghost"
                      size="sm"
                      className="text-primary hover:text-blue-700"
                    >
                      <i className="fas fa-external-link-alt mr-1"></i>View Details
                    </Button>
                    {event.createdByUser && (
                      <span className="text-xs text-neutral-500">
                        by {event.createdByUser.firstName || event.createdByUser.email}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
