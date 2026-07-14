// lib/campaigns/prompt-template.ts
// Resolves the outbound system prompt template's {{placeholders}} into a
// campaign's locked-in resolved_prompt at creation time — so the weekly
// webinar script is set once, not re-typed/re-edited every campaign.

export type Condition = "Knee" | "Hip" | "Spine" | "Other";
export const CONDITIONS: Condition[] = ["Knee", "Hip", "Spine", "Other"];

export function formatWebinarDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatWebinarTime(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? "0");
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function resolvePromptTemplate(
  template: string,
  vars: { doctorName: string; condition: string; webinarDate: string; webinarTime: string }
): string {
  return template
    .replaceAll("{{doctor_name}}", vars.doctorName)
    .replaceAll("{{condition}}", vars.condition)
    .replaceAll("{{webinar_date}}", formatWebinarDate(vars.webinarDate))
    .replaceAll("{{webinar_time}}", formatWebinarTime(vars.webinarTime));
}
