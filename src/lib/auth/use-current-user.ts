import { useEffect, useState } from "react";
import { authClient, authEnabled } from "./client";

export type CurrentUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function useCurrentUserState() {
  const session = authClient.useSession();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isPending, setPending] = useState(true);

  useEffect(() => {
    if (!authEnabled) {
      setUser({ id: "dev-user", name: "Director" });
      setPending(false);
      return;
    }
    setPending(session.isPending);
    const s = session.data?.user;
    setUser(
      s
        ? { id: s.id, name: s.name, email: s.email, image: s.image }
        : null,
    );
  }, [session.isPending, session.data]);

  return { user, isPending };
}
