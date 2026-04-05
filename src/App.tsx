import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { IconLibraryProvider } from "@/contexts/IconLibraryContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import DuplicatePolicy from "./pages/DuplicatePolicy";

const queryClient = new QueryClient();

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
 const { user, loading } = useAuth();
 
 if (loading) {
 return (
 <div className="min-h-screen flex items-center justify-center bg-background">
 <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
 </div>
 );
 }
 
 if (!user) {
 return <Navigate to="/auth" replace />;
 }
 
 return <>{children}</>;
}

const App = () => (
 <QueryClientProvider client={queryClient}>
 <IconLibraryProvider>
 <TooltipProvider>
 <Toaster />
 <Sonner />
 <BrowserRouter>
 <Routes>
 <Route path="/auth" element={<Auth />} />
 <Route path="/terms" element={<Terms />} />
 <Route path="/duplicate-policy" element={<DuplicatePolicy />} />
 <Route 
 path="/" 
 element={
 <ProtectedRoute>
 <Index />
 </ProtectedRoute>
 } 
 />
 {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
 <Route path="*" element={<NotFound />} />
 </Routes>
 </BrowserRouter>
 </TooltipProvider>
 </IconLibraryProvider>
 </QueryClientProvider>
);

export default App;
