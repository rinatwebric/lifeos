import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { ThemeProvider } from "./theme";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { LocaleProvider } from "@/lib/i18n/I18nContext";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  // Order matters: AuthProvider sits inside QueryClientProvider because it
  // calls queryClient.clear() on sign-out and account switch; LocaleProvider
  // and ThemeProvider sit inside both because they read the session and
  // the profile query. Locale wraps Theme so theme labels translate too.
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LocaleProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </LocaleProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
