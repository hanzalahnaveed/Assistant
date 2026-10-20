import CalendarClient from "@/components/client/calendar-client";
export const metadata = {
  title: "Calendar & meetings — Assistant",
  description: "Prepare meetings and create approved events in Google Calendar.",
};
export default function CalendarPage() {
  return <CalendarClient />;
}
