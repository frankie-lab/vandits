import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/domains/identity";
import { IconLibraryProvider } from "@/contexts/IconLibraryContext";
import { resumeIfPending } from "@/stores/geocoding-job-store";
import { prefetchAllUsernames } from "@/domains/identity/lib/username-registry";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import DuplicatePolicy from "./pages/DuplicatePolicy";
import { AdminShell, AdminShellIndex } from "./pages/admin/AdminShell";
import { AdminRoutePage } from "./pages/admin/AdminRoutePage";
import { GlobalLoadingBar } from "@/shared/loading";
import { DesignSystemThemeProvider } from "@/design-system/runtime/theme-provider";
import { EditModeBar } from "@/components/admin/design-system/EditModeBar";
import { SourceFilterBridge } from "@/components/poi/SourceFilterBridge";
import { CameraFitQaGate } from "@/components/debug/CameraFitQaGate";



const queryClient = new QueryClient();

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
 const { user, loading } = useAuth();

 useEffect(() => {
   if (user) {
     void resumeIfPending();
     // PR-POI-SOURCE-7: prefetch eager de profiles para que los hashtags
     // de origen muestren username (`#sandbox-agent`) sin necesidad de
     // abrir UsersSidebar.
     void prefetchAllUsernames();
   }
 }, [user]);

 
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
 <DesignSystemThemeProvider>
 <TooltipProvider>
    <Toaster />
     <GlobalLoadingBar />
      <EditModeBar />
        <SourceFilterBridge />
        <CameraFitQaGate />
        
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

          {/* Back Office shell (PR-BACKOFFICE-UX-CANON-3). Capability gate
              vive en AdminShell (open_back_office || manage_users) y en
              cada AdminRoutePage (capability del tab). */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminShellIndex />} />
            <Route path=":tab" element={<AdminRoutePage />} />
          </Route>

 {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
 <Route path="*" element={<NotFound />} />
 </Routes>
 </BrowserRouter>
 </TooltipProvider>
 </DesignSystemThemeProvider>
 </IconLibraryProvider>
 </QueryClientProvider>
);

export default App;
