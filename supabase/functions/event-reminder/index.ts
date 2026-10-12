import { response, service, validWorker } from "../_shared/runtime.ts";
Deno.serve(async (request) => {
  try {
    if (request.method !== "POST")
      return response({ error: "Method not allowed" }, 405);
    if (!(await validWorker(request)))
      return response({ error: "Unauthorized" }, 401);
    const configured = Deno.env.get("EVENT_DATE");
    if (!configured)
      return response({ queued: 0, message: "Event date is not announced" });
    const date = new Date(configured);
    const days = Number(Deno.env.get("REMINDER_DAYS_BEFORE") ?? 2);
    if (!Number.isFinite(date.getTime()) || !Number.isInteger(days) || days < 0)
      throw new Error("Invalid reminder configuration");
    const due = date.getTime() - days * 86400000;
    const now = Date.now();
    if (now < due || now >= date.getTime()) return response({ queued: 0 });
    const queued = await service().rpc("queue_event_reminders");
    if (queued.error) throw queued.error;
    return response({ queued: queued.data });
  } catch {
    return response({ error: "Reminder worker unavailable" }, 500);
  }
});
