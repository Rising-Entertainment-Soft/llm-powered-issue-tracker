import { redirect } from "next/navigation";

// Ticket creation is now inline on the list page. Keep this path as a
// redirect so old bookmarks / auto-complete still lead somewhere useful.
export default function DeprecatedNewPage() {
  redirect("/");
}
