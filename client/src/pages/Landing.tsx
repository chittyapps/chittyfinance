import { Button } from "@/components/ui/button";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="glass-morphism fixed top-0 left-0 right-0 z-50 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-primary to-accent rounded-lg flex items-center justify-center">
              <i className="fas fa-handshake text-white text-sm"></i>
            </div>
            <span className="text-xl font-bold text-neutral-800">Close Lender</span>
          </div>
          
          <Button 
            onClick={handleLogin}
            className="hero-gradient text-white hover:shadow-lg transform hover:scale-105 transition-all duration-300"
          >
            Sign In
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-5xl md:text-6xl font-bold text-neutral-800 mb-6 animate-fade-in">
              Lending Made 
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                {" "}Personal
              </span>
            </h1>
            <p className="text-xl text-neutral-600 max-w-3xl mx-auto mb-8 animate-slide-up">
              Replace corporate villains with your community. Professional loan management tools for friends, family, and neighbors who believe in each other.
            </p>
            
            <div className="relative max-w-4xl mx-auto mb-12">
              <img 
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=600" 
                alt="Modern financial app interface" 
                className="rounded-2xl shadow-2xl w-full h-auto animate-float" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl"></div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button 
                onClick={handleLogin}
                className="hero-gradient text-white px-8 py-4 rounded-xl font-semibold text-lg hover:shadow-lg transform hover:scale-105 transition-all duration-300"
              >
                <i className="fas fa-rocket mr-2"></i>
                Start Lending Today
              </Button>
              <Button 
                variant="outline"
                className="glass-morphism text-neutral-700 px-8 py-4 rounded-xl font-semibold text-lg hover:shadow-lg transition-all duration-300"
              >
                <i className="fas fa-play mr-2"></i>
                Watch Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-neutral-800 mb-4">Professional-Grade Tools</h2>
            <p className="text-xl text-neutral-600">Everything you need to manage loans like a pro</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="loan-card rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-primary to-blue-400 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <i className="fas fa-chart-line text-white text-2xl"></i>
              </div>
              <h3 className="text-xl font-bold text-neutral-800 mb-3">Interactive Timeline</h3>
              <p className="text-neutral-600">Track every payment, communication, and milestone with legal-grade precision.</p>
            </div>

            <div className="loan-card rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-secondary to-emerald-400 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <i className="fas fa-shield-alt text-white text-2xl"></i>
              </div>
              <h3 className="text-xl font-bold text-neutral-800 mb-3">Bank-Grade Security</h3>
              <p className="text-neutral-600">256-bit encryption and secure document storage for all your lending agreements.</p>
            </div>

            <div className="loan-card rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-accent to-purple-400 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <i className="fas fa-robot text-white text-2xl"></i>
              </div>
              <h3 className="text-xl font-bold text-neutral-800 mb-3">AI-Powered Insights</h3>
              <p className="text-neutral-600">Smart recommendations for rates, terms, and risk assessment.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-16 px-4 bg-gradient-to-r from-neutral-50 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold text-neutral-800 mb-6">Built on Trust, Powered by Technology</h2>
              <p className="text-xl text-neutral-600 mb-8">Professional-grade loan management tools that preserve the human element in lending relationships.</p>
              
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-primary to-blue-400 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-gavel text-white text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-800 mb-2">Legal Documentation</h3>
                    <p className="text-neutral-600">Automated legal document generation and timeline management for dispute resolution.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-secondary to-emerald-400 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-users text-white text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-800 mb-2">Community Network</h3>
                    <p className="text-neutral-600">Connect with trusted friends, family, and neighbors for mutual financial support.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-accent to-purple-400 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-chart-pie text-white text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-800 mb-2">Analytics Dashboard</h3>
                    <p className="text-neutral-600">Comprehensive insights into loan performance and payment trends.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative">
              <img 
                src="https://images.unsplash.com/photo-1521791136064-7986c2920216?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=600" 
                alt="Professional handshake symbolizing trust" 
                className="rounded-2xl shadow-2xl w-full h-auto animate-float" 
              />
              <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-gradient-to-r from-secondary to-emerald-400 rounded-2xl opacity-20 animate-pulse"></div>
              <div className="absolute -top-6 -left-6 w-32 h-32 bg-gradient-to-r from-primary to-accent rounded-2xl opacity-20 animate-pulse"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-neutral-900 text-white py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-r from-primary to-accent rounded-lg flex items-center justify-center">
                <i className="fas fa-handshake text-white text-sm"></i>
              </div>
              <span className="text-xl font-bold">Close Lender</span>
            </div>
            <p className="text-neutral-400 mb-6">Revolutionizing personal lending with community trust and professional tools.</p>
            <p className="text-neutral-400">&copy; 2024 Close Lender. All rights reserved. Built with ❤️ for community lending.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
