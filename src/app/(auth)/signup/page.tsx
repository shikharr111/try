import { redirect } from "next/navigation";

/** Account creation lives on the sign-in screen (second tab). */
export default function SignupPage() {
  redirect("/login?mode=register");
}
