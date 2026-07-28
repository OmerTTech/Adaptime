import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ThemeToggle from "@/components/ThemeToggle";
import LoginPage from "@/pages/LoginPage";
import TodayPage from "@/pages/TodayPage";

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-text-muted text-sm">Yükleniyor...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <TodayPage />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
        <ThemeToggle />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
