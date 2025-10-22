import { Building2, MapPin, Users, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Property {
  id: string;
  name: string;
  address: string;
  occupancy: number;
  monthlyRevenue: number;
  status: "healthy" | "attention" | "critical";
}

export default function PropertyWatchlist() {
  const properties: Property[] = [
    {
      id: "1",
      name: "Sunset Apartments",
      address: "123 Main St, Portland, OR",
      occupancy: 95,
      monthlyRevenue: 12500,
      status: "healthy"
    },
    {
      id: "2",
      name: "Downtown Lofts",
      address: "456 Broadway, Seattle, WA",
      occupancy: 78,
      monthlyRevenue: 18200,
      status: "attention"
    },
    {
      id: "3",
      name: "Riverside Complex",
      address: "789 River Rd, Austin, TX",
      occupancy: 88,
      monthlyRevenue: 15600,
      status: "healthy"
    }
  ];

  return (
    <div className="apple-card p-6 fade-slide-in" data-testid="card-property-watchlist">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold mb-1">Property Watchlist</h3>
          <p className="text-sm text-muted-foreground">
            Monitor your portfolio at a glance
          </p>
        </div>
        <Button variant="outline" size="sm" data-testid="button-view-all-properties">
          View All
        </Button>
      </div>

      <div className="space-y-4">
        {properties.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </div>
    </div>
  );
}

interface PropertyCardProps {
  property: Property;
}

function PropertyCard({ property }: PropertyCardProps) {
  const getStatusColor = (status: Property["status"]) => {
    switch (status) {
      case "healthy":
        return "bg-primary/10 text-primary";
      case "attention":
        return "bg-accent/10 text-accent";
      case "critical":
        return "bg-destructive/10 text-destructive";
    }
  };

  return (
    <div
      className="interactive-card apple-card p-4 cursor-pointer"
      data-testid={`property-card-${property.id}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium mb-1" data-testid={`text-property-name-${property.id}`}>
              {property.name}
            </h4>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{property.address}</span>
            </div>
          </div>
        </div>
        <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(property.status)}`}>
          {property.status}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Occupancy</p>
            <p className="text-sm font-medium" data-testid={`text-occupancy-${property.id}`}>
              {property.occupancy}%
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Monthly Revenue</p>
            <p className="text-sm font-medium" data-testid={`text-revenue-${property.id}`}>
              ${property.monthlyRevenue.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
