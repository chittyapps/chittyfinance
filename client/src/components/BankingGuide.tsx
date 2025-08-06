import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function BankingGuide() {
  const [, setLocation] = useLocation();

  const steps = [
    {
      icon: "fas fa-user-plus",
      title: "1. Find Someone to Help",
      description: "Think of friends, family, or community members who could use a loan",
      action: "Consider people you trust who need financial support"
    },
    {
      icon: "fas fa-calculator",
      title: "2. Set Your Terms",
      description: "Decide how much to lend, interest rate, and payment schedule",
      action: "Keep it simple - even 3-5% beats most savings accounts"
    },
    {
      icon: "fas fa-handshake",
      title: "3. Create the Loan",
      description: "Use our tools to make it official and professional",
      action: () => setLocation("/create-loan"),
      actionText: "Start Your First Loan"
    },
    {
      icon: "fas fa-chart-line",
      title: "4. Earn & Track",
      description: "Get paid back with interest while helping someone achieve their goals",
      action: "Watch your money grow while making a difference"
    }
  ];

  return (
    <Card className="glass-morphism border-0 shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-neutral-800 flex items-center gap-2">
          <i className="fas fa-university text-primary"></i>
          How to Be Your Own Bank
        </CardTitle>
        <p className="text-neutral-600">
          Transform from saver to lender in 4 simple steps
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {steps.map((step, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center flex-shrink-0">
                <i className={`${step.icon} text-white text-sm`}></i>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-neutral-800 mb-1">
                  {step.title}
                </h3>
                <p className="text-sm text-neutral-600 mb-2">
                  {step.description}
                </p>
                {typeof step.action === 'function' ? (
                  <Button 
                    onClick={step.action} 
                    size="sm" 
                    className="hero-gradient text-white text-xs"
                  >
                    {step.actionText}
                  </Button>
                ) : (
                  <p className="text-xs text-neutral-500 italic">
                    {step.action}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 p-4 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg">
          <div className="flex items-start gap-3">
            <i className="fas fa-lightbulb text-primary text-lg mt-1"></i>
            <div>
              <h4 className="font-semibold text-neutral-800 mb-1">Why This Works</h4>
              <p className="text-sm text-neutral-600">
                Banks make money by lending your savings to others. Now you can do the same - 
                lend directly to people you know and keep all the interest for yourself.
                It's banking made simple, personal, and profitable.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}