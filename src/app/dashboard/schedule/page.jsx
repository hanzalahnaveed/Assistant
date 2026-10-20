import ScheduleClient from "@/components/client/schedule-client";

export const metadata = {
  title: "Schedule — Assistant",
  description: "Manage tasks and calendar events in one schedule workspace.",
};

export default function SchedulePage() {
  return <ScheduleClient />;
}
