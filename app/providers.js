'use client';

import { AuthProvider } from "@/hooks/useAuth";

export default function Providers({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
