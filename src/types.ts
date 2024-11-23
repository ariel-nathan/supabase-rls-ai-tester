export type SafeReturn<T> = Promise<{
  data: T | null;
  error: Error | null;
}>;

export type Table = {
  table_name: string;
  columns: string[];
  data_types: string[];
};

export type CMD = "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export type RLSPolicy = {
  schemaname: string;
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string;
  cmd: CMD;
  qual: string | null;
  with_check: string | null;
};

export type WorkerMessage = {
  policy: RLSPolicy;
  testGuide: string;
  supabaseTestHelpers: string;
  env: {
    CLAUDE_API_KEY: string;
    PG_USER: string;
    PG_PASSWORD: string;
    PG_HOST: string;
    PG_PORT: string;
    PG_DATABASE: string;
  };
};
