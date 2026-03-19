import { createServiceClient } from "@/lib/supabase/service";
import { JobsTable, type JobRow } from "./JobsTable";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const supabase = createServiceClient();

  // Fetch last 500 jobs with site name join, newest first
  const { data: jobs } = await supabase
    .from("ai_jobs")
    .select(
      `id, job_type, status, created_at, started_at, completed_at, error,
       payload, bull_job_id,
       sites ( name, id )`,
    )
    .order("created_at", { ascending: false })
    .limit(500);

  return <JobsTable initialJobs={(jobs ?? []) as unknown as JobRow[]} />;
}
