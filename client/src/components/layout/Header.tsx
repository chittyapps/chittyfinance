import { Bell, MoreVertical } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TenantSwitcher from "@/components/TenantSwitcher";

export default function Header() {
  return (
    <header className="relative z-10 flex flex-shrink-0 h-16 bg-zinc-900 border-b border-zinc-800 shadow-lg">
      <div className="flex justify-between flex-1 px-4">
        <div className="flex flex-1 items-center">
          {/* Chitty Services Logo */}
          <div className="flex items-center mr-6">
            <img 
              src="/assets/SERVICES.png" 
              alt="Chitty Services Logo" 
              className="h-10 w-auto"
            />
            <div className="ml-2">
              <span className="text-lg font-bold gradient-text">Chitty Services</span>
            </div>
          </div>

          <div className="flex w-full md:ml-0">
            <div className="relative w-full text-zinc-400 focus-within:text-lime-400">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <Input 
                className="block w-full h-full pl-10 pr-3 py-2 text-zinc-200 bg-zinc-800 border-zinc-700 rounded-md focus:border-lime-500 focus:ring-lime-500 focus:ring-opacity-20 sm:text-sm" 
                placeholder="Search financial data..." 
              />
            </div>
          </div>
        </div>
        
        <div className="ml-4 flex items-center md:ml-6 gap-3">
          <TenantSwitcher />
          <ThemeToggle />

          <button className="ml-3 p-1 rounded-full text-muted-foreground hover:text-orange-500 dark:hover:text-orange-400 focus:outline-none transition-colors">
            <Bell className="h-6 w-6" />
          </button>

          <div className="ml-3 relative">
            <button className="flex max-w-xs bg-zinc-800 border border-zinc-700 rounded-full p-1 text-sm hover:border-lime-500 transition-colors">
              <MoreVertical className="h-6 w-6 text-zinc-300" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}