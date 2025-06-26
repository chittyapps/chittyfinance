import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";

export default function Login() {
  const [, setLocation] = useLocation();
  
  const handleLogin = () => {
    // Redirect to the Replit Auth login endpoint
    window.location.href = "/api/login";
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950 p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img 
            src="/assets/SERVICES.png" 
            alt="Chitty Services Logo" 
            className="h-16 w-auto mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold gradient-text mb-2">Chitty Services</h1>
          <p className="text-zinc-400">AI-Powered CFO Assistant</p>
        </div>
        
        <Card className="border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-xl text-zinc-200">Sign In</CardTitle>
            <CardDescription className="text-zinc-400">
              Connect to your financial platforms and get AI-powered insights
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Button 
              onClick={handleLogin} 
              className="w-full bg-lime-500 hover:bg-lime-600 text-black font-medium"
            >
              Sign in with Replit
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-zinc-700" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-zinc-900 text-zinc-500">Or continue as guest</span>
              </div>
            </div>
            
            <Button 
              variant="outline" 
              className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              onClick={() => setLocation("/")}
            >
              Continue to Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4 border-t border-zinc-800 pt-4">
            <p className="text-xs text-zinc-500 text-center">
              By signing in, you'll be able to connect your financial accounts for a personalized experience.
            </p>
            
            <div className="text-center">
              <Button variant="link" className="text-xs text-lime-400 hover:text-lime-500" asChild>
                <a href="https://nevershitty.com" target="_blank" rel="noopener noreferrer">
                  Powered by Chitty Services <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}