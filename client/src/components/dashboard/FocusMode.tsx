import { useState, createContext, useContext } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FocusModeContextType {
  focusMode: boolean;
  toggleFocusMode: () => void;
}

const FocusModeContext = createContext<FocusModeContextType>({
  focusMode: false,
  toggleFocusMode: () => {},
});

export const useFocusMode = () => useContext(FocusModeContext);

export function FocusModeProvider({ children }: { children: React.ReactNode }) {
  const [focusMode, setFocusMode] = useState(false);

  const toggleFocusMode = () => setFocusMode(!focusMode);

  return (
    <FocusModeContext.Provider value={{ focusMode, toggleFocusMode }}>
      <div className={focusMode ? "focus-mode" : ""}>
        {children}
      </div>
    </FocusModeContext.Provider>
  );
}

export function FocusModeToggle() {
  const { focusMode, toggleFocusMode } = useFocusMode();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={focusMode ? "default" : "outline"}
            size="sm"
            onClick={toggleFocusMode}
            className="gap-2"
            data-testid="button-focus-mode"
          >
            {focusMode ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="hidden sm:inline">
              {focusMode ? "Exit Focus" : "Focus Mode"}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs text-sm">
            {focusMode
              ? "Exit focus mode to see all cards"
              : "Enable focus mode to reduce distractions and highlight priority items"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
