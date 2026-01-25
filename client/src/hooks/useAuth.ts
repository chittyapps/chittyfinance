import { useContext } from "react";
import { AuthContext } from "../App";
import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  // Use the auth context for immediate access to auth state
  const authContext = useContext(AuthContext);
  
  // Use react-query to fetch the latest user data
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/session"],
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    user: (user as any) ?? authContext.user,
    isLoading: Boolean(isLoading) || authContext.isLoading,
    isAuthenticated: Boolean(user) || authContext.isAuthenticated,
  };
}
