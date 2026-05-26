-- Add "uploading" as a valid transient status for jobs being created via client-side upload
ALTER TABLE print_jobs DROP CONSTRAINT IF EXISTS print_jobs_status_check;
ALTER TABLE print_jobs ADD CONSTRAINT print_jobs_status_check
  CHECK (status IN (
    'uploading', 'pending', 'approved', 'claimed',
    'downloading', 'printing', 'printed',
    'failed', 'cancelled', 'rejected'
  ));
