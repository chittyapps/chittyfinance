import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { 
  ArrowRight, 
  CheckCircle, 
  Star, 
  Zap, 
  Shield, 
  DollarSign,
  TrendingUp,
  Users,
  Sparkles
} from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white dark:from-gray-900 dark:to-gray-950">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <Badge className="mb-4 bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">
              <Sparkles className="h-3 w-3 mr-1" />
              Trusted by 10,000+ businesses
            </Badge>
            
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
              <span className="gradient-text">Claudefo</span>
            </h1>
            
            <p className="text-2xl sm:text-3xl font-semibold text-muted-foreground mb-4">
              AI-Powered Financial Operations Platform
            </p>
            
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground mb-8">
              Finally, financial management that doesn't make you want to pull your hair out. 
              We handle the boring stuff so you can focus on what actually matters - growing your business.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login">
                <Button size="lg" className="bg-orange-500 hover:bg-orange-600 text-white px-8">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30">
                Watch 2-min Demo
              </Button>
              <a href="/connect" target="_blank" rel="noreferrer">
                <Button size="lg" variant="outline" className="border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30">
                  Connect with ChittyConnect
                </Button>
              </a>
            </div>
            
            <p className="mt-4 text-sm text-muted-foreground">
              No credit card required • Cancel anytime • Actually useful
            </p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-4 py-16 sm:px-6 lg:px-8 bg-white dark:bg-gray-950">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">
              Everything You Need, Nothing You Don't
            </h2>
            <p className="text-lg text-muted-foreground">
              We cut the BS and built only what actually helps you succeed
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="hover:shadow-lg transition-shadow hover:border-orange-500/50">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center text-orange-500 dark:text-orange-400 mb-4">
                  <Zap className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Lightning Fast Setup</h3>
                <p className="text-muted-foreground">
                  Connect your accounts in 60 seconds. Seriously, we timed it. 
                  No consultants or 47-step onboarding required.
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow hover:border-orange-500/50">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center text-orange-500 dark:text-orange-400 mb-4">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Bank-Level Security</h3>
                <p className="text-muted-foreground">
                  Your data is locked down tighter than your ex's Instagram. 
                  256-bit encryption, SOC 2, the whole nine yards.
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow hover:border-orange-500/50">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center text-orange-500 dark:text-orange-400 mb-4">
                  <DollarSign className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Actually Affordable</h3>
                <p className="text-muted-foreground">
                  No "contact us for pricing" BS. One fair price, all features included. 
                  Cancel anytime without calling anyone.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-4xl font-bold text-orange-500 dark:text-orange-400">10K+</p>
              <p className="text-muted-foreground">Happy Businesses</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-orange-500 dark:text-orange-400">4.9/5</p>
              <p className="text-muted-foreground">Average Rating</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-orange-500 dark:text-orange-400">2M+</p>
              <p className="text-muted-foreground">Invoices Processed</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-orange-500 dark:text-orange-400">$1B+</p>
              <p className="text-muted-foreground">Money Tracked</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="px-4 py-16 sm:px-6 lg:px-8 bg-white dark:bg-gray-950">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold text-center mb-12">
            Don't Just Take Our Word For It
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-orange-500 text-orange-500" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4">
                  "Finally, accounting software that doesn't make me want to throw my laptop out the window. 
                  10/10 would recommend to anyone who hates spreadsheets."
                </p>
                <div className="flex items-center">
                  <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
                    <Users className="h-5 w-5 text-orange-500 dark:text-orange-400" />
                  </div>
                  <div className="ml-3">
                    <p className="font-semibold">Sarah Chen</p>
                    <p className="text-sm text-muted-foreground">CEO, TechStartup Inc</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-orange-500 text-orange-500" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4">
                  "Switched from [Competitor] and saved 15 hours a month. 
                  Plus, their support actually responds in minutes, not days. Game changer."
                </p>
                <div className="flex items-center">
                  <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-orange-500 dark:text-orange-400" />
                  </div>
                  <div className="ml-3">
                    <p className="font-semibold">Mike Rodriguez</p>
                    <p className="text-sm text-muted-foreground">CFO, Growth Co</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-orange-500 text-orange-500" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4">
                  "The AI actually gives useful advice instead of generic BS. 
                  It's like having a CFO who doesn't judge my 3am financial decisions."
                </p>
                <div className="flex items-center">
                  <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-orange-500 dark:text-orange-400" />
                  </div>
                  <div className="ml-3">
                    <p className="font-semibold">Alex Kim</p>
                    <p className="text-sm text-muted-foreground">Founder, Creative Agency</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <Card className="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
            <CardContent className="pt-8 pb-8">
              <h2 className="text-3xl font-bold mb-4">
                Ready to Experience Financial Management That Doesn't Suck?
              </h2>
              <p className="text-lg text-muted-foreground mb-6">
                Join thousands who've already made the switch. 
                30-day free trial, no credit card required, cancel anytime.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
                <Link href="/login">
                  <Button size="lg" className="bg-orange-500 hover:bg-orange-600 text-white px-8">
                    Start Your Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30">
                  Schedule a Demo
                </Button>
              </div>
              <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-orange-500 dark:text-orange-400 mr-1" />
                  No credit card required
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-orange-500 dark:text-orange-400 mr-1" />
                  30-day free trial
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-orange-500 dark:text-orange-400 mr-1" />
                  Cancel anytime
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
