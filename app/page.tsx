import { redirect } from "next/navigation";

export default function RootPage() {
  // Automatically bounce users over to the protected portal dashboard
  redirect("/dashboard");
}
