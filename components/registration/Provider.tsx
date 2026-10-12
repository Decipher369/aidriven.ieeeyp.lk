"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { isConfigured, supabase } from "@/lib/registration/client";
import type { Admin, Profile } from "@/lib/registration/database";
interface AuthState {
  session: Session | null;
  admin: Admin | null;
  profile: Profile | null;
  loading: boolean;
  error: Error | null;
}
const AuthContext = createContext<AuthState>({
  session: null,
  admin: null,
  profile: null,
  loading: true,
  error: null,
});
export const useAuth = () => useContext(AuthContext);
function AuthProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isConfigured());
  const [sessionError, setSessionError] = useState<Error | null>(null);
  useEffect(() => {
    if (!isConfigured()) return;
    let alive = true;
    void supabase()
      .auth.getSession()
      .then(({ data, error }) => {
        if (alive) {
          setSession(data.session);
          setSessionError(error);
          setReady(true);
        }
      });
    const { data } = supabase().auth.onAuthStateChange((_event, value) => {
      if (alive) {
        setSession(value);
        setReady(true);
      }
      if (!value) {
        cache.clear();
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key?.startsWith("aidsl-ticket:")) localStorage.removeItem(key);
        }
      }
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [cache]);
  const identity = useQuery({
    queryKey: ["identity", session?.user.id],
    enabled: ready && Boolean(session),
    retry: 1,
    queryFn: async () => {
      const verified = await supabase().auth.getUser();
      if (verified.error) throw verified.error;
      if (!verified.data.user) throw new Error("Please sign in again.");
      const [admin, profile] = await Promise.all([
        supabase()
          .from("admins")
          .select("*")
          .eq("user_id", verified.data.user.id)
          .maybeSingle(),
        supabase()
          .from("profiles")
          .select("*")
          .eq("id", verified.data.user.id)
          .maybeSingle(),
      ]);
      if (admin.error) throw admin.error;
      if (profile.error) throw profile.error;
      return { admin: admin.data, profile: profile.data };
    },
  });
  return (
    <AuthContext.Provider
      value={{
        session,
        admin: identity.data?.admin ?? null,
        profile: identity.data?.profile ?? null,
        loading: !ready || (Boolean(session) && identity.isPending),
        error: sessionError ?? identity.error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export default function RegistrationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15000, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
