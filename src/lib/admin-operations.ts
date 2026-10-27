export interface AdminOperations {
  observedAt: string;
  appVersion: string;
  database: { status: "reachable"; checkMs: number };
  application: { uptimeSeconds: number; memoryMb: number; heapUsedMb: number };
  attention: { pendingReports: number; failedSignIns24h: number; scheduledWaiting: number; scheduledDue: number };
}
