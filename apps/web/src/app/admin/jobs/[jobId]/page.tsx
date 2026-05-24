import { JobDetail } from "./view";

export default function AdminJobPage({ params }: { params: { jobId: string } }) {
  return <JobDetail jobId={params.jobId} />;
}
