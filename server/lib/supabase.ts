type SupabaseCheck = {
  configured: boolean;
  reachable: boolean;
  schemaAvailable: boolean;
  detail: string;
};

export async function checkSupabaseConnection(): Promise<SupabaseCheck> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    return {
      configured: false,
      reachable: false,
      schemaAvailable: false,
      detail: "Supabase environment variables are missing",
    };
  }

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  };

  try {
    const settingsResponse = await fetch(
      `${url.replace(/\/$/, "")}/auth/v1/settings`,
      { headers },
    );
    if (!settingsResponse.ok) {
      return {
        configured: true,
        reachable: false,
        schemaAvailable: false,
        detail: `Supabase auth endpoint returned HTTP ${settingsResponse.status}`,
      };
    }

    const rolesResponse = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/roles?select=id&limit=1`,
      { headers },
    );
    return {
      configured: true,
      reachable: true,
      schemaAvailable: rolesResponse.ok,
      detail: rolesResponse.ok
        ? "Supabase project and application schema are reachable"
        : `Supabase project is reachable, but the roles table returned HTTP ${rolesResponse.status}`,
    };
  } catch {
    return {
      configured: true,
      reachable: false,
      schemaAvailable: false,
      detail: "Supabase endpoint could not be reached",
    };
  }
}
