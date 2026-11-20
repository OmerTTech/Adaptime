import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { I18nProvider, useI18n } from "@/i18n";
import ThemeToggle from "@/components/ThemeToggle";
import LoginPage from "@/pages/LoginPage";
import TodayPage from "@/pages/TodayPage";
import SharedPlanPage from "@/pages/SharedPlanPage";

/** `?p=<jeton>`: oturum açmadan görülen salt-okunur plan (4.1). */
const SHARED_TOKEN = new URLSearchParams(window.location.search).get("p");

function AppContent() {
  const { user, isLoading } = useAuth();
  const { t } = useI18n();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-text-muted text-sm">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <TodayPage />;
}

function App() {
  if (SHARED_TOKEN) {
    return (
      <I18nProvider>
        <ThemeProvider>
          <SharedPlanPage token={SHARED_TOKEN} />
        </ThemeProvider>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
          <ThemeToggle />
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

export default App;
